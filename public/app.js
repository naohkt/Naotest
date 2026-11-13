// Espace client
const $ = (id) => document.getElementById(id);
const KEY = 'fidelite.cardId';
let config, card;

function store(k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur réseau'), { status: res.status });
  return data;
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function init() {
  config = await api('/api/config');
  document.title = `${config.restaurantName} – Fidélité`;
  document.documentElement.style.setProperty('--c', config.color);
  $('resto').textContent = config.restaurantName;
  $('welcome').textContent = config.welcomeText;
  $('rule').textContent = `${config.stampsRequired} visites = ${config.rewardText}`;

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Le jeton peut arriver par l'URL (app installée sur iPhone) ou le stockage local
  const fromUrl = new URLSearchParams(location.search).get('c');
  if (fromUrl) store(KEY, fromUrl);
  const id = fromUrl || load(KEY);

  if (id) {
    try { card = await api(`/api/cards/${encodeURIComponent(id)}`); }
    catch (e) { if (e.status === 404) store(KEY); else throw e; }
  }
  card ? showCard() : ($('signup').hidden = false);
}

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const btn = e.submitter; btn.disabled = true;
  try {
    const f = new FormData(e.target);
    card = await api('/api/cards', { method: 'POST', body: JSON.stringify({ name: f.get('name'), phone: f.get('phone') }) });
    store(KEY, card.id);
    $('signup').hidden = true;
    showCard();
  } catch (err) { showError(err.message); }
  finally { btn.disabled = false; }
});

function showCard() {
  $('card').hidden = false;
  // L'URL contient le jeton : ainsi "Ajouter à l'écran d'accueil" garde la carte
  history.replaceState(null, '', `/?c=${encodeURIComponent(card.id)}`);
  $('manifest').href = `/manifest.webmanifest?c=${encodeURIComponent(card.id)}`;
  renderCard();
  setupNotifications();
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

async function refresh() {
  try { card = await api(`/api/cards/${encodeURIComponent(card.id)}`); renderCard(); } catch {}
}

let lastStamps = -1;
function renderCard() {
  const n = config.stampsRequired;
  $('cName').textContent = card.name;
  $('cCode').textContent = card.code;
  $('qr').src = `/api/qr/${card.code}.svg`;
  const box = $('stamps');
  if (lastStamps !== card.stamps) {
    box.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'stamp' + (i < card.stamps ? ' on' : '') + (i === n - 1 ? ' last' : '');
      d.textContent = i < card.stamps ? '★' : (i === n - 1 ? '🎁' : '');
      box.appendChild(d);
    }
    lastStamps = card.stamps;
  }
  const left = n - card.stamps;
  $('progress').textContent = `${card.stamps} / ${n} — plus que ${left} visite${left > 1 ? 's' : ''} avant : ${config.rewardText}`;
  $('rewardBox').hidden = card.rewards < 1;
  $('rewardBox').textContent = `🎉 ${card.rewards > 1 ? card.rewards + ' récompenses disponibles' : 'Récompense disponible'} : ${config.rewardText} ! Montrez cette carte en caisse.`;
}

// ---------- Notifications ----------
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function setupNotifications() {
  const btn = $('notifBtn'), text = $('notifText');

  if (!pushSupported) {
    if (isIOS && !isStandalone) { $('notifPanel').hidden = true; $('iosHelp').hidden = false; }
    else { text.textContent = "Votre navigateur ne permet pas les notifications. Essayez avec Chrome ou Safari à jour."; btn.hidden = true; }
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing && Notification.permission === 'granted') {
    // On renvoie l'abonnement au serveur au cas où (nouvel appareil, réinstallation…)
    api(`/api/cards/${encodeURIComponent(card.id)}/subscribe`, { method: 'POST', body: JSON.stringify(existing) }).catch(() => {});
    return setNotifOn();
  }
  if (Notification.permission === 'denied') {
    text.textContent = 'Les notifications sont bloquées. Autorisez-les dans les réglages de votre navigateur pour ce site.';
    btn.hidden = true; return;
  }
  btn.onclick = async () => {
    btn.disabled = true; showError('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Vous avez refusé les notifications.');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(config.vapidPublicKey) });
      await api(`/api/cards/${encodeURIComponent(card.id)}/subscribe`, { method: 'POST', body: JSON.stringify(sub) });
      setNotifOn();
    } catch (err) { showError(err.message); btn.disabled = false; }
  };
}

function setNotifOn() {
  $('notifText').innerHTML = '<span class="ok">✅ Notifications activées</span> — vous serez prévenu(e) de vos récompenses et de nos offres.';
  $('notifBtn').hidden = true;
}

// Bouton d'installation (Android / Chrome)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  if (card) $('installPanel').hidden = false;
});
$('installBtn').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $('installPanel').hidden = true;
};

init().catch((e) => showError('Impossible de charger la carte : ' + e.message));
