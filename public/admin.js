// Espace restaurant
const $ = (id) => document.getElementById(id);
const PW = 'fidelite.adminpw';
let pw = sessionStorage.getItem(PW) || '';
let settings, current;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showError(msg) { $('error').textContent = msg || ''; $('error').hidden = !msg; }

async function api(path, opts = {}) {
  const res = await fetch('/api/admin' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-password': pw } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('Mot de passe incorrect'); }
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

// ---------- Connexion ----------
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  pw = new FormData(e.target).get('pw');
  try { await start(); sessionStorage.setItem(PW, pw); } catch (err) { showError(err.message); }
};
function logout() { pw = ''; sessionStorage.removeItem(PW); $('app').hidden = true; $('login').hidden = false; }
$('logout').onclick = logout;

async function start() {
  settings = await api('/settings');
  showError('');
  $('login').hidden = true; $('app').hidden = false;
  applySettings();
  loadStats();
}
function applySettings() {
  $('resto').textContent = settings.restaurantName;
  document.documentElement.style.setProperty('--c', settings.color);
  const f = $('settingsForm');
  for (const k of ['restaurantName', 'amountPerPoint', 'currency', 'rewardPoints', 'rewardText', 'welcomeText', 'color']) f.elements[k].value = settings[k];
}
async function loadStats() {
  const s = await api('/stats');
  $('stats').innerHTML = [
    [s.cards, 'cartes créées'], [s.subscribed, 'avec notifications'],
    [s.visitsToday, "passages en caisse aujourd'hui"], [s.rewardsRedeemed, 'récompenses utilisées'],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  $('subCount').textContent = `${s.subscribed} client(s) recevront la notification.`;
}

// ---------- Onglets ----------
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('[data-panel]').forEach((p) => p.hidden = p.dataset.panel !== b.dataset.tab);
  if (b.dataset.tab === 'clients') loadClients();
  if (b.dataset.tab !== 'scan') stopCam();
  showError('');
});

// ---------- Caisse : scan + tampons ----------
let stream, scanning = false;
const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

$('camBtn').onclick = async () => {
  if (scanning) return stopCam();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('video'); v.srcObject = stream; v.hidden = false; await v.play();
    scanning = true; $('camBtn').textContent = '✖ Arrêter la caméra';
    requestAnimationFrame(scanLoop);
  } catch (e) { showError("Impossible d'ouvrir la caméra (" + e.message + '). Saisissez le code à la main.'); }
};
function stopCam() {
  scanning = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; $('video').hidden = true; $('camBtn').textContent = '📷 Scanner la carte du client';
}
async function scanLoop() {
  if (!scanning) return;
  const v = $('video');
  if (v.readyState >= 2) {
    let text = null;
    try {
      if (detector) { const r = await detector.detect(v); text = r[0]?.rawValue; }
      else if (window.jsQR) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data;
      }
    } catch {}
    if (text) { stopCam(); navigator.vibrate?.(100); return openCard(text); }
  }
  setTimeout(() => requestAnimationFrame(scanLoop), 150);
}

$('codeForm').onsubmit = (e) => { e.preventDefault(); openCard(e.target.elements.code.value); e.target.reset(); };

async function openCard(code) {
  showError('');
  try { current = await api('/cards/by-code/' + encodeURIComponent(code.trim().toUpperCase())); renderCurrent(); }
  catch (e) { showError(e.message); }
}

function renderCurrent(flash = '') {
  const c = current, goal = settings.rewardPoints;
  $('current').hidden = false;
  $('current').innerHTML = `
    ${flash ? `<div class="flash">${flash}</div>` : ''}
    <div class="row"><h2 style="margin:0">${esc(c.name)}</h2><span class="muted">${esc(c.code)}</span></div>
    <p style="margin:6px 0;font-size:1.6rem;font-weight:800;color:var(--c)">${c.points} points</p>
    <p class="muted" style="margin:0">${c.totalVisits} visite(s) · ${Math.round(c.totalSpent)} ${esc(settings.currency)} dépensés au total</p>
    ${c.points >= goal ? `<p class="rule"><strong>🎁 A droit à : ${esc(settings.rewardText)}</strong></p>` : ''}
    <form id="buyForm" style="margin-top:14px">
      <label>Montant de l'addition (${esc(settings.currency)})
        <input name="amount" type="number" inputmode="decimal" min="0" step="any" required placeholder="ex. 350">
      </label>
      <button class="btn primary" style="font-size:1.15rem;padding:16px" id="buyBtn">Ajouter les points</button>
    </form>
    <div class="actions">
      <button class="btn" data-act="redeem" ${c.points < goal ? 'disabled' : ''}>🎁 Utiliser la récompense (−${goal})</button>
      <button class="btn" data-act="adjust">✏️ Corriger les points</button>
    </div>`;
  const amount = $('current').querySelector('input[name=amount]');
  amount.oninput = () => {
    const pts = Math.floor((parseFloat(amount.value) || 0) / settings.amountPerPoint + 1e-9);
    $('buyBtn').textContent = pts > 0 ? `Ajouter ${pts} point${pts > 1 ? 's' : ''}` : 'Ajouter les points';
  };
  $('buyForm').onsubmit = (e) => { e.preventDefault(); act('purchase', $('buyBtn'), { amount: amount.value }); };
  $('current').querySelector('[data-act=redeem]').onclick = (e) => {
    if (confirm(`Utiliser la récompense de ${c.name} ? (${goal} points seront retirés)`)) act('redeem', e.target);
  };
  $('current').querySelector('[data-act=adjust]').onclick = (e) => {
    const v = prompt('Combien de points ajouter ? (mettre un chiffre négatif pour retirer, ex. -5)');
    if (v && parseInt(v, 10)) act('adjust', e.target, { delta: parseInt(v, 10) });
  };
  if (!flash) amount.focus();
}

async function act(action, btn, body = {}) {
  btn.disabled = true;
  try {
    const r = await api(`/cards/${current.code}/${action}`, { method: 'POST', body: JSON.stringify(body) });
    current = { ...current, ...r };
    const msg = { purchase: `✅ +${r.earned} point${r.earned > 1 ? 's' : ''}`, redeem: '🎁 Récompense utilisée', adjust: 'Points corrigés' }[action];
    renderCurrent(msg); loadStats();
  } catch (e) { showError(e.message); btn.disabled = false; }
}

// ---------- Notifications ----------
$('notifyForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), btn = e.submitter;
  if (!confirm('Envoyer cette notification à tous vos clients ?')) return;
  btn.disabled = true;
  try {
    const r = await api('/notify', { method: 'POST', body: JSON.stringify({ title: f.get('title'), body: f.get('body') }) });
    $('notifyResult').innerHTML = `<div class="flash">Envoyée à ${r.sent} téléphone(s)${r.failed ? ` · ${r.failed} échec(s)` : ''}</div>`;
    e.target.reset(); loadStats();
  } catch (err) { showError(err.message); }
  finally { btn.disabled = false; }
};

// ---------- Clients ----------
let searchTimer;
$('search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadClients, 250); };
async function loadClients() {
  const list = await api('/cards?q=' + encodeURIComponent($('search').value));
  $('clientList').innerHTML = list.length ? list.map((c) => `
    <li data-code="${esc(c.code)}">
      <span><strong>${esc(c.name)}</strong> ${c.notifications ? '🔔' : ''}<br><small>${esc(c.code)}${c.phone ? ' · ' + esc(c.phone) : ''}</small></span>
      <span style="text-align:right"><strong>${c.points} pts</strong>${c.points >= settings.rewardPoints ? ' 🎁' : ''}<br><small>${c.lastVisit ? 'vu le ' + new Date(c.lastVisit + 'Z').toLocaleDateString('fr-FR') : 'jamais venu'}</small></span>
    </li>`).join('') : '<li class="muted">Aucun client pour l’instant.</li>';
  $('clientList').querySelectorAll('li[data-code]').forEach((li) => li.onclick = () => {
    document.querySelector('[data-tab="scan"]').click(); openCard(li.dataset.code);
  });
}

// ---------- Réglages ----------
$('settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    settings = await api('/settings', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    applySettings();
    $('settingsResult').innerHTML = '<div class="flash">Enregistré ✅</div>';
    setTimeout(() => $('settingsResult').innerHTML = '', 2500);
  } catch (err) { showError(err.message); }
};

if (pw) start().catch(() => logout());
