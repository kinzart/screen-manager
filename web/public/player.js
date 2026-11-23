'use strict';

const byId = (id) => document.getElementById(id);
const receiver = byId('tv-output');
const stage = byId('tv-stage');
const storageKey = 'fbs-tv-pairing';
let phase = 'verify';
let csrf = '';
let pairing;
let pairingInFlight = false;
let pairRetryAt = 0;
let pairExpired = false;
let current;
let playingMedia;
let tickInFlight = false;
let lastPollAt = 0;
let snapshotNumber = 0;
let connected = false;
let lastAcknowledged = '';
let lastAckAt = 0;
let ackInFlight = false;
let ackBlockedUntil = 0;
let ackRetryAt = 0;
let ackEpoch = 0;
let controlsTimer;

// Protocolo 2: plano local (offline), relógio do servidor, cache e telemetria.
const PLAYER_VERSION = '1.1.0';
const core = window.FBSCore;
const cache = window.FBSCache || {
  supported: false, update: function () {}, protect: function () {}, isReady: function () { return false; },
  stats: function () { return { supported: false }; }, storage: function () { return Promise.resolve({}); },
  clear: function () { return Promise.resolve(); }
};
let plan = null;
let planHash = '';
let clockOffset = 0;
let offlineSince = 0;
let lastOnline = null;
let waitingMedia = null;
let heartbeatAt = -Infinity;
let offlineRenderAt = 0;
let memoryDeviceId = '';

function write(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function api(path, method, body, extra) {
  const headers = Object.assign({}, extra);
  if (method !== 'GET' && csrf) headers['X-FBS-CSRF'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 6000) : null;
  return fetch('/api/v1' + path, {
    method: method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: headers,
    signal: controller ? controller.signal : undefined,
    credentials: 'same-origin',
    cache: 'no-store'
  }).then((response) => response.json().then((data) => {
    if (response.ok) return data;
    const error = new Error(data.error || 'Falha na conexão com o estúdio.');
    error.status = response.status;
    throw error;
  })).finally(() => clearTimeout(timeout));
}

function setMode(mode) {
  receiver.dataset.mode = mode;
  byId('tv-pairing').hidden = mode !== 'pairing';
  byId('tv-idle').hidden = mode !== 'connecting' && mode !== 'idle';
  byId('tv-logo').hidden = mode !== 'logo';
}

function rememberPairing(value) {
  pairing = value;
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch (error) {
    // Pairing can proceed in memory when storage is unavailable.
  }
}

function recoverPairing() {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey));
    if (value && /^[0-9]{6}$/.test(value.code) && typeof value.id === 'string' && typeof value.challenge === 'string') return value;
  } catch (error) {
    // An invalid record can be replaced with a new code.
  }
  return null;
}

function pairFeedback(message, error) {
  const node = byId('pair-status');
  node.dataset.error = String(Boolean(error));
  write(node, message);
}

function displayPairing() {
  const code = pairing ? pairing.code : '';
  write(byId('pair-code'), code);
  const link = byId('pair-link');
  if (!code) {
    link.hidden = true;
    byId('pair-qr').removeAttribute('src');
    return;
  }
  const url = new URL('/studio#pair=' + code, location.origin).href;
  link.href = url;
  if (link.dataset.code === code && !link.hidden) return;
  if (typeof window.qrcode === 'function') {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      byId('pair-qr').src = qr.createDataURL(5, 20);
      link.dataset.code = code;
      link.hidden = false;
    } catch (error) {
      link.hidden = true;
    }
  }
}

async function newPairing() {
  if (phase !== 'pair' || pairingInFlight) return;
  const name = byId('screen-name').value.trim();
  if (!name) return;
  pairingInFlight = true;
  byId('new-code').disabled = true;
  pairFeedback('Gerando código…');
  try {
    const value = await api('/pairing', 'POST', { name: name });
    rememberPairing(Object.assign(value, { name: name }));
    pairExpired = false;
    displayPairing();
    pairFeedback('Aguardando aprovação no estúdio.');
  } catch (error) {
    pairRetryAt = performance.now() + (error.status === 429 ? 15000 : 3500);
    pairFeedback(error.status ? error.message : 'Sem conexão. O receptor vai tentar novamente.', true);
  } finally {
    pairingInFlight = false;
    byId('new-code').disabled = false;
  }
}

function enterPairing(restore) {
  phase = 'pair';
  csrf = '';
  current = null;
  plan = null;
  planHash = '';
  lastOnline = null;
  offlineSince = 0;
  waitingMedia = null;
  cache.clear();
  connected = false;
  lastAcknowledged = '';
  ackEpoch++;
  stopMedia();
  if (restore) {
    rememberPairing(recoverPairing());
    if (pairing && pairing.name) byId('screen-name').value = pairing.name;
  } else {
    rememberPairing(null);
  }
  setMode('pairing');
  displayPairing();
  if (pairing) pairFeedback('Aguardando aprovação no estúdio.');
  else newPairing();
}

function enterSession(session) {
  phase = 'screen';
  csrf = session.csrf;
  pairExpired = false;
  current = null;
  connected = false;
  ackEpoch++;
  lastAcknowledged = '';
  ackBlockedUntil = 0;
  ackRetryAt = 0;
  rememberPairing(null);
  write(byId('tv-caption'), 'Conectando ao estúdio…');
  setMode('connecting');
}

function markPairingExpired() {
  rememberPairing(null);
  pairExpired = true;
  displayPairing();
  pairFeedback('O código expirou. Gere um novo código para continuar.', true);
}

async function pollPairing() {
  if (pairingInFlight) return;
  if (!pairing) {
    if (!pairExpired && performance.now() >= pairRetryAt) await newPairing();
    return;
  }
  const active = pairing;
  let claiming = false;
  try {
    const status = await api('/pairing/' + active.id, 'GET', undefined, { 'X-FBS-Pairing': active.challenge });
    if (pairing !== active || pairingInFlight) return;
    if (status.status === 'expired') {
      markPairingExpired();
    } else if (status.status === 'approved') {
      pairFeedback('Tela aprovada. Conectando…');
      pairingInFlight = true;
      claiming = true;
      byId('new-code').disabled = true;
      const session = await api('/pairing/' + active.id + '/claim', 'POST', { challenge: active.challenge });
      enterSession(session);
    } else {
      pairFeedback('Aguardando aprovação no estúdio.');
    }
  } catch (error) {
    if (pairing !== active) return;
    if (error.status === 403 || error.status === 404 || error.status === 409) {
      // The cookie may already have been issued if a claim was interrupted.
      const session = await api('/me?role=screen', 'GET');
      if (session.authenticated) enterSession(session);
      else markPairingExpired();
    } else {
      pairFeedback('Sem conexão com o estúdio. Aguardando retorno.', true);
    }
  } finally {
    if (claiming) {
      pairingInFlight = false;
      byId('new-code').disabled = false;
    }
  }
}

function stopMedia() {
  const old = playingMedia;
  playingMedia = null;
  byId('tv-unlock').hidden = true;
  if (!old || !old.node) return;
  if (old.item.type === 'video') old.node.pause();
  old.node.removeAttribute('src');
  if (old.item.type === 'video') old.node.load();
  if (old.node.parentNode === stage) stage.removeChild(old.node);
}

function mediaURL(item) {
  const url = new URL(item.url, location.origin);
  if (url.origin !== location.origin || url.pathname !== '/api/v1/media/' + encodeURIComponent(item.mediaId)) {
    throw new Error('Endereço da mídia inválido.');
  }
  url.search = 'role=screen';
  url.hash = '';
  return url.href;
}

function failed(media, message) {
  if (playingMedia !== media || media.error) return;
  media.error = message;
  media.retryAt = performance.now() + Math.min(12000, 1000 * Math.pow(2, media.attempts));
  media.running = false;
  if (media.item.type === 'video') media.node.pause();
  acknowledge();
}

function mountMedia(item, attempt) {
  stopMedia();
  const isVideo = item.type === 'video';
  const node = document.createElement(isVideo ? 'video' : 'img');
  const media = {
    item: item, node: node, attempts: attempt || 0, primed: false, loaded: false, running: false,
    targetOnLoad: true, pendingPlay: false, blocked: false, error: '', retryAt: 0
  };
  playingMedia = media;
  node.dataset.testid = 'tv-media';
  node.dataset.mediaId = item.mediaId;
  node.dataset.itemId = item.id;
  node.addEventListener('error', () => failed(media, 'Falha ao carregar ' + item.name + '.'));
  if (isVideo) {
    node.poster = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    node.preload = 'auto';
    node.muted = true;
    node.defaultMuted = true;
    node.playsInline = true;
    node.setAttribute('muted', '');
    node.setAttribute('playsinline', '');
    node.setAttribute('webkit-playsinline', '');
    node.setAttribute('aria-label', item.name);
    node.addEventListener('loadedmetadata', () => {
      if (playingMedia !== media) return;
      media.targetOnLoad = true;
      synchronize();
      acknowledge();
    });
    for (const event of ['loadeddata', 'canplay', 'seeked']) {
      node.addEventListener(event, () => {
        if (playingMedia !== media) return;
        media.primed = node.readyState >= 2;
        synchronize();
        acknowledge();
      });
    }
    node.addEventListener('playing', () => {
      if (playingMedia !== media) return;
      media.running = true;
      media.primed = true;
      acknowledge();
    });
    for (const event of ['pause', 'ended', 'waiting', 'stalled']) {
      node.addEventListener(event, () => {
        if (playingMedia !== media) return;
        if (event !== 'stalled' || node.readyState < 3) media.running = false;
        acknowledge();
      });
    }
  } else {
    node.alt = item.name;
    node.addEventListener('load', () => {
      if (playingMedia !== media) return;
      media.loaded = true;
      acknowledge();
    });
  }
  stage.appendChild(node);
  try {
    node.src = mediaURL(item);
  } catch (error) {
    failed(media, error.message);
  }
}

function desiredPosition(snapshot, at) {
  const output = snapshot.output;
  return Math.max(0, Math.min(output.item.durationMs,
    output.positionMs + (output.playing ? Math.max(0, at - snapshot.sampleAt) : 0)));
}

function tryPlay(media) {
  if (media.pendingPlay || media.blocked) return;
  media.pendingPlay = true;
  Promise.resolve(media.node.play()).catch((error) => {
    if (playingMedia !== media) return;
    if (error.name === 'NotAllowedError') {
      media.blocked = true;
      byId('tv-unlock').hidden = false;
      showTools();
      acknowledge();
    } else if (error.name !== 'AbortError') {
      failed(media, 'Falha ao reproduzir ' + media.item.name + '.');
    }
  }).finally(() => { media.pendingPlay = false; });
}

function synchronize() {
  const media = playingMedia;
  const output = current && current.output;
  if (!media || !output || output.mode !== 'media') return;
  const now = performance.now();
  if (media.error) {
    if (connected && now >= media.retryAt) mountMedia(media.item, media.attempts + 1);
    return;
  }
  if (media.item.type !== 'video') return;
  const video = media.node;
  if (!video.readyState) return;

  const position = desiredPosition(current, now);
  const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
  const wanted = Math.min(position / 1000, duration);
  const withinVideo = wanted < duration - .03;
  const shouldPlay = output.playing && position < media.item.durationMs && withinVideo;
  if (!shouldPlay && !video.paused) video.pause();
  const tolerance = media.targetOnLoad ? .08 : .7;
  if (!video.seeking && Math.abs(video.currentTime - wanted) > tolerance) {
    try {
      video.currentTime = wanted;
      media.targetOnLoad = false;
    } catch (error) {
      // A subsequent loadedmetadata or seekable update can apply this position.
    }
  } else if (!video.seeking) {
    media.targetOnLoad = false;
  }
  if (shouldPlay && video.paused && !video.seeking) tryPlay(media);
}

function actualPlayback() {
  if (waitingMedia) return { status: 'waiting-media', mediaId: waitingMedia.mediaId };
  const output = current.output;
  if (!output || (output.mode === 'media' && !output.item)) return { status: 'idle' };
  if (output.mode !== 'media') return { status: output.mode };
  const media = playingMedia;
  if (!media || media.item.id !== output.item.id) return null;
  const mediaId = media.item.mediaId;
  if (media.error) return { status: 'error', mediaId: mediaId, message: media.error.slice(0, 240) };
  if (media.item.type === 'image') {
    if (!media.loaded) return null;
    return { status: output.playing ? 'playing' : 'paused', mediaId: mediaId };
  }
  const video = media.node;
  if (media.blocked) return { status: 'error', mediaId: mediaId, message: 'Toque em Ativar reprodução no receptor.' };
  if (!media.primed || video.seeking) return null;
  const status = !video.paused && media.running ? 'playing'
    : !output.playing || video.ended ? 'paused' : 'ready';
  return { status: status, mediaId: mediaId };
}

function acknowledge() {
  if (!current || phase !== 'screen' || !connected || ackInFlight ||
    snapshotNumber < ackBlockedUntil || performance.now() < ackRetryAt) return;
  const actual = actualPlayback();
  if (!actual) return;
  const body = Object.assign({
    routeVersion: current.screen.routeVersion,
    playlistVersion: current.source ? current.source.version : null
  }, actual);
  const key = JSON.stringify(body);
  if (key === lastAcknowledged && performance.now() - lastAckAt < 5000) return;
  const sentAt = snapshotNumber;
  const epoch = ackEpoch;
  ackInFlight = true;
  api('/screens/self/ack', 'POST', body).then(() => {
    if (epoch === ackEpoch) {
      lastAcknowledged = key;
      lastAckAt = performance.now();
    }
  }).catch((error) => {
    if (epoch !== ackEpoch) return;
    if (error.status === 401) enterPairing(false);
    else if (error.status === 409) {
      ackBlockedUntil = sentAt + 1;
      lastAcknowledged = '';
      tick();
    } else ackRetryAt = performance.now() + 1000;
  }).finally(() => {
    ackInFlight = false;
    acknowledge();
  });
}

function applySnapshot(snapshot, started, offline) {
  const now = performance.now();
  const previous = current;
  current = Object.assign(snapshot, { sampleAt: (started + now) / 2 });
  const routeChanged = !previous || previous.screen.routeVersion !== snapshot.screen.routeVersion;
  let recovered = false;
  if (!offline) {
    recovered = !connected || now - lastPollAt >= 15000;
    if (recovered || routeChanged) {
      ackEpoch++;
      lastAcknowledged = '';
      ackRetryAt = 0;
    }
    if (snapshot.plan) plan = snapshot.plan;
    if (snapshot.planHash) planHash = snapshot.planHash;
    if (isFinite(snapshot.serverNowMs)) clockOffset = snapshot.serverNowMs - (Date.now() - (now - current.sampleAt));
    lastOnline = snapshot;
    offlineSince = 0;
    cache.update(planHash);
    connected = true;
    snapshotNumber++;
    lastPollAt = now;
    write(byId('tv-network'), '');
  }
  document.title = snapshot.screen.name + ' · Tela FBS';

  const output = snapshot.output;
  let mode = output && (output.mode !== 'media' || output.item) ? output.mode : 'idle';
  // Sessão obrigatória sem a mídia em cache: aplica a alternativa configurada em vez de começar.
  waitingMedia = null;
  if (mode === 'media' && snapshot.screen.required && cache.supported && plan && plan.fallback !== 'stream'
      && !cache.isReady(output.item.mediaId)) {
    waitingMedia = { mediaId: output.item.mediaId };
    mode = plan.fallback;
  }
  cache.protect(mode === 'media' ? output.item.mediaId : null);
  if (routeChanged || mode !== 'media') stopMedia();
  setMode(mode);
  if (mode === 'idle') {
    write(byId('tv-title'), snapshot.screen.name);
    write(byId('tv-caption'), snapshot.source ? 'Aguardando conteúdo da sessão.' : 'Aguardando conexão no estúdio.');
  }
  if (mode === 'media') {
    const media = playingMedia;
    const item = output.item;
    if (!media || media.item.id !== item.id || media.item.mediaId !== item.mediaId || media.item.type !== item.type) {
      mountMedia(item, 0);
    } else {
      media.item = item;
      if (media.error && recovered) media.retryAt = now;
      if (previous && previous.output && previous.output.item && previous.output.item.id === item.id) {
        const difference = Math.abs(desiredPosition(previous, now) - desiredPosition(current, now));
        if (difference > 500 || previous.output.playing !== output.playing) media.targetOnLoad = true;
      }
    }
    synchronize();
  }
  acknowledge();
}

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  const started = performance.now();
  try {
    if (phase === 'verify') {
      const session = await api('/me?role=screen', 'GET');
      if (session.authenticated) enterSession(session);
      else enterPairing(true);
    }
    if (phase === 'screen') {
      const pollStarted = performance.now();
      const epoch = ackEpoch;
      const snapshot = await api('/state?role=screen' + (planHash && plan ? '&plan=' + encodeURIComponent(planHash) : ''), 'GET');
      if (phase === 'screen' && epoch === ackEpoch) applySnapshot(snapshot, pollStarted);
    } else if (phase === 'pair') await pollPairing();
  } catch (error) {
    if (phase === 'screen' && error.status === 401) enterPairing(false);
    else if (phase === 'pair') pairFeedback('Sem conexão com o estúdio. Aguardando retorno.', true);
    else {
      if (lastPollAt <= started) {
        connected = false;
        if (!offlineSince) offlineSince = Date.now();
      }
      if (!current) write(byId('tv-caption'), 'Sem conexão. Tentando reconectar…');
      write(byId('tv-network'), 'Estúdio desconectado. Tentando reconectar.');
    }
  } finally {
    tickInFlight = false;
  }
}

function showTools() {
  receiver.dataset.controls = 'true';
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => {
    receiver.dataset.controls = String(!byId('tv-unlock').hidden);
  }, 3300);
}

const fullButton = byId('tv-fullscreen');
const full = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
const exit = document.exitFullscreen || document.webkitExitFullscreen;
const fullscreenActive = () => document.fullscreenElement || document.webkitFullscreenElement;
const fullscreenEnabled = document.fullscreenEnabled !== undefined ? document.fullscreenEnabled : document.webkitFullscreenEnabled;
fullButton.hidden = !full || !exit || fullscreenEnabled === false;
fullButton.addEventListener('click', () => {
  const command = fullscreenActive() ? exit.call(document) : full.call(document.documentElement);
  Promise.resolve(command).catch(() => showTools());
});
function updateFullscreen() {
  write(fullButton, fullscreenActive() ? 'Sair da tela cheia' : 'Tela cheia');
}
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('webkitfullscreenchange', updateFullscreen);
document.addEventListener('mousemove', showTools, { passive: true });
document.addEventListener('touchstart', showTools, { passive: true });
document.addEventListener('keydown', showTools);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
byId('tv-unlock').addEventListener('click', () => {
  if (!playingMedia) return;
  playingMedia.blocked = false;
  byId('tv-unlock').hidden = true;
  tryPlay(playingMedia);
});
byId('pair-form').addEventListener('submit', (event) => {
  event.preventDefault();
  newPairing();
});
// Sem rede: executa o último plano recebido no relógio estimado do servidor (sem ACK).
function offlineStep() {
  if (phase !== 'screen' || connected || !plan || !current || !core) return;
  const now = performance.now();
  if (now - offlineRenderAt < 1000) return;
  offlineRenderAt = now;
  const serverNow = Date.now() + clockOffset;
  const evaluated = core.planOutput(plan, serverNow);
  const segment = evaluated.segment;
  const key = segment ? segment.key : 'none';
  const routeVersion = lastOnline && lastOnline.screen.segmentKey === key ? lastOnline.screen.routeVersion : 'offline:' + key;
  applySnapshot({
    serverNowMs: serverNow,
    screen: Object.assign({}, current.screen, { routeVersion: routeVersion, required: Boolean(segment && segment.required), segmentKey: key }),
    source: segment && segment.playlistId ? plan.playlists[segment.playlistId] || null : null,
    output: evaluated.output
  }, now, true);
  write(byId('tv-network'), 'Sem conexão. Reproduzindo a programação local.');
}

function deviceId() {
  try {
    let id = localStorage.getItem('fbs-device-id');
    if (!id || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, (value) => (value < 16 ? '0' : '') + value.toString(16)).join('');
      localStorage.setItem('fbs-device-id', id);
    }
    return id;
  } catch (error) {
    if (!memoryDeviceId) memoryDeviceId = 'mem' + Math.random().toString(16).slice(2, 14);
    return memoryDeviceId;
  }
}

function heartbeat() {
  if (phase !== 'screen' || !connected || performance.now() - heartbeatAt < 10000) return;
  heartbeatAt = performance.now();
  cache.storage().catch(() => ({})).then((storage) => api('/screens/self/heartbeat', 'POST', {
    protocol: core ? core.PROTOCOL : 2,
    deviceId: deviceId(),
    app: { name: 'tela-fbs-web', version: PLAYER_VERSION },
    platform: navigator.userAgent.slice(0, 160),
    cache: cache.stats(),
    storage: { usage: Math.round(storage.usage || 0), quota: Math.round(storage.quota || 0) },
    clockOffsetMs: Math.round(clockOffset),
    errors: playingMedia && playingMedia.error ? [playingMedia.error] : []
  })).catch(() => { heartbeatAt = performance.now() - 7000; });
}

window.addEventListener('online', tick);
window.addEventListener('offline', () => { connected = false; if (!offlineSince) offlineSince = Date.now(); });
setInterval(() => { tick(); heartbeat(); }, 1000);
setInterval(() => { offlineStep(); synchronize(); acknowledge(); }, 200);
tick();
