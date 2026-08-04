// Página de exibição (aberta no navegador da TV/Chromecast/Fire TV/Android
// TV). Sem build step, sem dependências — puro DOM/JS, pra rodar em
// qualquer navegador embutido de smart TV, por mais limitado que seja.
//
// Fluxo: cria uma sala (POST /api/rooms) → mostra o código grande na tela
// → conecta como "display" no WebSocket da mesma sala → reage a comandos
// (show/blackout/logo/pause/resume/clear) vindos do celular.

const pairingEl = document.getElementById('pairing');
const pairingCodeEl = document.getElementById('pairing-code');
const stageEl = document.getElementById('stage');
const mediaSlotEl = document.getElementById('media-slot');
const blackoutEl = document.getElementById('blackout');
const disconnectedEl = document.getElementById('disconnected');

const KNOWN_TRANSITIONS = ['cut', 'fade', 'slide-left', 'slide-up', 'zoom'];

let ws = null;
let currentMediaEl = null;
let roomCode = null;

function wsUrl(room) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws?role=display&room=${room}`;
}

function clearMediaSlot() {
  mediaSlotEl.innerHTML = '';
  currentMediaEl = null;
}

function fitClass(fit) {
  return fit === 'cover' ? 'fit-cover' : 'fit-contain';
}

function transitionClass(transition) {
  const value = KNOWN_TRANSITIONS.includes(transition) ? transition : 'fade';
  return `enter-${value}`;
}

function showMedia(item) {
  pairingEl.hidden = true;
  stageEl.hidden = false;
  blackoutEl.hidden = true;
  clearMediaSlot();
  const isVideo = item.type === 'video';
  const el = document.createElement(isVideo ? 'video' : 'img');
  el.className = `${fitClass(item.fit)} ${transitionClass(item.transition)}`;
  if (isVideo) {
    el.autoplay = true;
    el.muted = true;
    el.playsInline = true;
    el.loop = !!item.duration;
    el.addEventListener('error', () => sendStatus({ type: 'status', error: `Não foi possível reproduzir "${item.name || 'o vídeo'}".` }));
  } else {
    el.addEventListener('error', () => sendStatus({ type: 'status', error: `Não foi possível carregar "${item.name || 'a imagem'}".` }));
  }
  el.src = item.mediaUrl;
  mediaSlotEl.appendChild(el);
  currentMediaEl = el;
}

function showBlackout() {
  pairingEl.hidden = true;
  stageEl.hidden = false;
  clearMediaSlot();
  blackoutEl.hidden = false;
}

function showLogo() {
  // v1: "logo" de tela cheia equivale a limpar a mídia e mostrar preto
  // (paridade mínima com o comportamento do desktop quando nenhuma marca
  // própria da TV foi configurada nesta etapa).
  showBlackout();
}

function clearStage() {
  pairingEl.hidden = false;
  stageEl.hidden = true;
  clearMediaSlot();
  blackoutEl.hidden = true;
}

function sendStatus(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function handleCommand(cmd) {
  switch (cmd.action) {
    case 'show': return showMedia(cmd.item || {});
    case 'blackout': return showBlackout();
    case 'logo': return showLogo();
    case 'pause': return currentMediaEl?.tagName === 'VIDEO' && currentMediaEl.pause();
    case 'resume': return currentMediaEl?.tagName === 'VIDEO' && currentMediaEl.play().catch(() => {});
    case 'clear': return clearStage();
    default: return;
  }
}

function connectWebSocket(room) {
  ws = new WebSocket(wsUrl(room));
  ws.addEventListener('open', () => { disconnectedEl.hidden = true; });
  ws.addEventListener('message', (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.action) handleCommand(payload);
  });
  ws.addEventListener('close', () => {
    disconnectedEl.hidden = false;
    setTimeout(() => connectWebSocket(room), 2000);
  });
  ws.addEventListener('error', () => ws.close());
}

async function init() {
  try {
    const response = await fetch('/api/rooms', { method: 'POST' });
    const data = await response.json();
    roomCode = data.room;
    pairingCodeEl.textContent = roomCode;
    connectWebSocket(roomCode);
  } catch (error) {
    pairingCodeEl.textContent = 'ERRO';
    console.error('[display] falha ao criar sala', error);
  }
}

init();
