// Carte de fidélité — serveur
// Lancement : npm start   (voir README.md)
process.removeAllListeners('warning'); // masque l'avertissement "SQLite experimental"

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');
const QRCode = require('qrcode');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

if (ADMIN_PASSWORD === 'changeme') {
  console.warn('⚠️  ADMIN_PASSWORD non défini : mot de passe admin = "changeme". À changer avant la mise en ligne !');
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Base de données ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'fidelite.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,              -- jeton secret (dans le téléphone du client)
    code TEXT UNIQUE NOT NULL,        -- code court lisible (montré / scanné en caisse)
    name TEXT NOT NULL,
    phone TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    total_spent REAL NOT NULL DEFAULT 0,
    total_visits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_visit TEXT
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT, type TEXT NOT NULL, detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const DEFAULT_SETTINGS = {
  restaurantName: process.env.RESTAURANT_NAME || 'Mon Restaurant',
  currency: '฿',
  amountPerPoint: '10',          // 10 ฿ dépensés = 1 point
  rewardPoints: '100',           // points nécessaires pour la récompense
  rewardText: 'Un plat offert',
  welcomeText: 'Gagnez des points à chaque visite et profitez de récompenses !',
  color: '#c0392b',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

function getSettings() {
  const s = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) s[row.key] = row.value;
  s.amountPerPoint = Math.max(0.01, parseFloat(s.amountPerPoint) || 10);
  s.rewardPoints = Math.max(1, parseInt(s.rewardPoints, 10) || 100);
  return s;
}

// ---------- Clés VAPID (notifications push) ----------
const vapidFile = path.join(DATA_DIR, 'vapid.json');
let vapid;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (fs.existsSync(vapidFile)) {
  vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidFile, JSON.stringify(vapid, null, 2));
  console.log('🔑 Clés de notification générées dans', vapidFile);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

async function pushToCard(cardId, payload) {
  const subs = db.prepare('SELECT endpoint, data FROM subscriptions WHERE card_id = ?').all(cardId);
  return sendToSubs(subs, payload);
}

async function sendToSubs(subs, payload) {
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(JSON.parse(s.data), body, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = abonnement expiré ou révoqué → on le supprime
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(s.endpoint);
      } else {
        console.error('Erreur push :', err.statusCode || '', err.body || err.message);
      }
    }
  }));
  return { sent, failed };
}

// ---------- Utilitaires ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM cards WHERE code = ?').get(c)) return c;
  }
}
const publicCard = (c) => c && ({
  id: c.id, code: c.code, name: c.name, points: c.points, totalSpent: c.total_spent,
  totalVisits: c.total_visits, createdAt: c.created_at, lastVisit: c.last_visit,
});
const logEvent = (cardId, type, detail = null) =>
  db.prepare('INSERT INTO events (card_id, type, detail) VALUES (?, ?, ?)').run(cardId, type, detail);

// ---------- Application ----------
const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Config publique (nom, règles, clé de notification)
app.get('/api/config', (req, res) => {
  const s = getSettings();
  res.json({ ...s, vapidPublicKey: vapid.publicKey });
});

// Manifeste PWA dynamique : sur iPhone, l'app "écran d'accueil" ne partage pas
// le stockage de Safari, donc on met le jeton de la carte dans l'URL de démarrage.
app.get('/manifest.webmanifest', (req, res) => {
  const s = getSettings();
  const c = /^[A-Za-z0-9_-]{10,40}$/.test(String(req.query.c || '')) ? String(req.query.c) : null;
  res.type('application/manifest+json').json({
    name: `${s.restaurantName} – Fidélité`,
    short_name: s.restaurantName.slice(0, 12),
    start_url: c ? `/?c=${c}` : '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: s.color,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
});

// Création d'une carte
app.post('/api/cards', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const phone = String(req.body.phone || '').trim().slice(0, 30) || null;
  if (!name) return res.status(400).json({ error: 'Le prénom est obligatoire.' });
  const id = crypto.randomBytes(18).toString('base64url');
  const code = newCode();
  db.prepare('INSERT INTO cards (id, code, name, phone) VALUES (?, ?, ?, ?)').run(id, code, name, phone);
  logEvent(id, 'created');
  res.json(publicCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id)));
});

// Lecture de sa carte (avec le jeton secret)
app.get('/api/cards/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Carte introuvable' });
  res.json(publicCard(c));
});

// Abonnement aux notifications
app.post('/api/cards/:id/subscribe', (req, res) => {
  const c = db.prepare('SELECT id FROM cards WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Carte introuvable' });
  const sub = req.body;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return res.status(400).json({ error: 'Abonnement invalide' });
  db.prepare(`INSERT INTO subscriptions (endpoint, card_id, data) VALUES (?, ?, ?)
              ON CONFLICT(endpoint) DO UPDATE SET card_id = excluded.card_id, data = excluded.data`)
    .run(sub.endpoint, c.id, JSON.stringify(sub));
  res.json({ ok: true });
});

app.post('/api/cards/:id/unsubscribe', (req, res) => {
  db.prepare('DELETE FROM subscriptions WHERE card_id = ? AND endpoint = ?').run(req.params.id, String(req.body.endpoint || ''));
  res.json({ ok: true });
});

// QR code de la carte du client (à présenter en caisse)
app.get('/api/qr/:code.svg', async (req, res) => {
  const svg = await QRCode.toString(String(req.params.code).slice(0, 20), { type: 'svg', margin: 1 });
  res.type('image/svg+xml').send(svg);
});

// Affiche à imprimer avec le QR code du restaurant
app.get('/affiche', async (req, res) => {
  const s = getSettings();
  const url = PUBLIC_URL.replace(/\/$/, '') + '/';
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche – ${esc(s.restaurantName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px 16px;color:#222}
h1{font-size:2.4rem;margin:0 0 8px;color:${esc(s.color)}}h2{font-weight:500;margin:0 0 32px}
.qr{width:min(320px,80vw);margin:0 auto}.qr svg{width:100%;height:auto}
p{font-size:1.2rem}.r{font-size:1.4rem;font-weight:700;color:${esc(s.color)}}
small{color:#777}@media print{button{display:none}}</style></head><body>
<h1>${esc(s.restaurantName)}</h1><h2>Votre carte de fidélité sur votre téléphone</h2>
<div class="qr">${svg}</div>
<p>📱 Scannez ce QR code avec l'appareil photo</p>
<p class="r">${esc(s.amountPerPoint)} ${esc(s.currency)} dépensés = 1 point<br>${s.rewardPoints} points = ${esc(s.rewardText)}</p>
<small>${esc(url)}</small><br><br><button onclick="print()">Imprimer</button></body></html>`);
});

// ---------- Espace restaurant (protégé par mot de passe) ----------
function requireAdmin(req, res, next) {
  const given = Buffer.from(String(req.get('x-admin-password') || ''));
  const expected = Buffer.from(ADMIN_PASSWORD);
  if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
  res.status(401).json({ error: 'Mot de passe incorrect' });
}
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/stats', (req, res) => {
  const one = (sql) => Object.values(db.prepare(sql).get())[0];
  res.json({
    cards: one('SELECT COUNT(*) FROM cards'),
    subscribed: one('SELECT COUNT(DISTINCT card_id) FROM subscriptions'),
    visitsToday: one("SELECT COUNT(*) FROM events WHERE type = 'purchase' AND date(created_at) = date('now')"),
    rewardsRedeemed: one("SELECT COUNT(*) FROM events WHERE type = 'redeem'"),
  });
});

admin.get('/cards', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.card_id = c.id) AS subs
    FROM cards c WHERE c.name LIKE ? OR c.code LIKE ? OR IFNULL(c.phone,'') LIKE ?
    ORDER BY COALESCE(c.last_visit, c.created_at) DESC LIMIT 200`).all(q, q, q);
  res.json(rows.map((r) => ({ ...publicCard(r), phone: r.phone, notifications: r.subs > 0 })));
});

admin.get('/cards/by-code/:code', (req, res) => {
  const c = db.prepare('SELECT * FROM cards WHERE code = ?').get(String(req.params.code).toUpperCase().trim());
  if (!c) return res.status(404).json({ error: 'Aucune carte avec ce code' });
  res.json({ ...publicCard(c), phone: c.phone });
});

// Ajouter des points selon le montant dépensé (ex. 250 ฿ → 25 points)
admin.post('/cards/:code/purchase', (req, res) => {
  const c = db.prepare('SELECT * FROM cards WHERE code = ?').get(req.params.code);
  if (!c) return res.status(404).json({ error: 'Carte introuvable' });
  const s = getSettings();
  const amount = Math.round(parseFloat(String(req.body.amount).replace(',', '.')) * 100) / 100;
  if (!(amount > 0) || amount > 1e7) return res.status(400).json({ error: 'Montant invalide' });
  const earned = Math.floor(amount / s.amountPerPoint + 1e-9);
  const points = c.points + earned;
  db.prepare("UPDATE cards SET points = ?, total_spent = total_spent + ?, total_visits = total_visits + 1, last_visit = datetime('now') WHERE id = ?")
    .run(points, amount, c.id);
  logEvent(c.id, 'purchase', JSON.stringify({ amount, earned }));

  const unlocked = c.points < s.rewardPoints && points >= s.rewardPoints;
  const payload = unlocked
    ? { title: '🎉 Récompense débloquée !', body: `Bravo ${c.name}, vous avez ${points} points : ${s.rewardText} vous attend !` }
    : { title: `${s.restaurantName} – merci !`, body: `+${earned} point${earned > 1 ? 's' : ''}. Vous avez maintenant ${points} points.` };
  if (earned > 0) pushToCard(c.id, { ...payload, url: '/' }).catch(() => {});
  res.json({ ...publicCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(c.id)), earned });
});

// Utiliser la récompense (retire les points correspondants)
admin.post('/cards/:code/redeem', (req, res) => {
  const c = db.prepare('SELECT * FROM cards WHERE code = ?').get(req.params.code);
  if (!c) return res.status(404).json({ error: 'Carte introuvable' });
  const s = getSettings();
  if (c.points < s.rewardPoints) return res.status(400).json({ error: `Il faut ${s.rewardPoints} points` });
  db.prepare('UPDATE cards SET points = points - ? WHERE id = ?').run(s.rewardPoints, c.id);
  logEvent(c.id, 'redeem');
  res.json(publicCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(c.id)));
});

// Corriger les points à la main (erreur de saisie)
admin.post('/cards/:code/adjust', (req, res) => {
  const c = db.prepare('SELECT * FROM cards WHERE code = ?').get(req.params.code);
  if (!c) return res.status(404).json({ error: 'Carte introuvable' });
  const delta = parseInt(req.body.delta, 10);
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Nombre invalide' });
  db.prepare('UPDATE cards SET points = MAX(0, points + ?) WHERE id = ?').run(delta, c.id);
  logEvent(c.id, 'adjust', String(delta));
  res.json(publicCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(c.id)));
});

// Envoyer une notification à tous les clients (ou à un seul)
admin.post('/notify', async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 80);
  const body = String(req.body.body || '').trim().slice(0, 300);
  if (!title || !body) return res.status(400).json({ error: 'Titre et message obligatoires.' });
  const subs = req.body.code
    ? db.prepare('SELECT s.endpoint, s.data FROM subscriptions s JOIN cards c ON c.id = s.card_id WHERE c.code = ?').all(req.body.code)
    : db.prepare('SELECT endpoint, data FROM subscriptions').all();
  const result = await sendToSubs(subs, { title, body, url: '/' });
  logEvent(null, 'broadcast', JSON.stringify({ title, body, ...result }));
  res.json(result);
});

admin.get('/settings', (req, res) => res.json(getSettings()));
admin.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (req.body[k] !== undefined) up.run(k, String(req.body[k]).slice(0, 300));
  }
  res.json(getSettings());
});

app.use('/api/admin', admin);

app.listen(PORT, () => {
  console.log(`✅ Carte de fidélité en ligne sur ${PUBLIC_URL}`);
  console.log(`   Espace client  : ${PUBLIC_URL}/`);
  console.log(`   Espace resto   : ${PUBLIC_URL}/admin`);
  console.log(`   Affiche QR     : ${PUBLIC_URL}/affiche`);
});
