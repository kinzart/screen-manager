const { WebSocket } = require('ws');

const MAX_BACKOFF_MS = 15000;

function relayUrl(serverUrl, room, token) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = new URLSearchParams({ role: 'desktop', room: String(room), token: String(token || '') }).toString();
  return url.toString();
}

/**
 * Keeps the Electron desktop connected outbound to remote/server.js.
 * The relay never opens a port on the event computer: it only maintains a
 * WSS connection and receives controller commands through that connection.
 */
function createRemoteRelay({ serverUrl, room, token, dispatch, snapshot, onChange = () => {}, logger = console } = {}) {
  if (!serverUrl) throw new Error('URL do relay remoto é obrigatória.');
  if (!room) throw new Error('Sala do relay remoto é obrigatória.');
  if (!token) throw new Error('Token do desktop é obrigatório.');
  if (typeof dispatch !== 'function') throw new Error('dispatch do relay remoto é obrigatório.');
  if (typeof snapshot !== 'function') throw new Error('snapshot do relay remoto é obrigatório.');

  let ws = null;
  let stopped = false;
  let timer = null;
  let backoff = 1000;
  let connecting = false;
  let lastError = '';
  let lastState = null;

  function info() {
    return {
      enabled: !stopped,
      connected: !!ws && ws.readyState === WebSocket.OPEN,
      serverUrl,
      room: String(room),
      lastError,
      retryIn: timer ? Math.max(0, Number(timer.dueAt || 0) - Date.now()) : 0,
    };
  }

  function report() {
    try { onChange(info()); } catch { /* status hooks cannot break the relay */ }
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }

  function publish(state = snapshot()) {
    lastState = state;
    return send({ type: 'state', state });
  }

  function schedule() {
    if (stopped || timer) return;
    const delay = backoff;
    const dueAt = Date.now() + delay;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, delay);
    timer.unref?.();
    timer.dueAt = dueAt;
    backoff = Math.min(MAX_BACKOFF_MS, Math.round(backoff * 1.7));
    report();
  }

  function closeSocket() {
    const current = ws;
    ws = null;
    if (!current) return;
    current.removeAllListeners();
    try { current.close(); } catch { try { current.terminate(); } catch {} }
  }

  function connect() {
    if (stopped || connecting || (ws && ws.readyState === WebSocket.OPEN)) return;
    connecting = true;
    const socket = new WebSocket(relayUrl(serverUrl, room, token));
    ws = socket;
    socket.once('open', () => {
      connecting = false;
      backoff = 1000;
      lastError = '';
      publish(lastState || snapshot());
      report();
    });
    socket.on('message', raw => {
      let payload;
      try { payload = JSON.parse(raw.toString()); } catch { return; }
      if (payload.type === 'state-request' || payload.type === 'request-state') {
        publish(snapshot());
        return;
      }
      if (!payload.action) return;
      const id = payload.id;
      Promise.resolve().then(() => dispatch(payload)).then(() => {
        send({ type: 'ack', id, ok: true });
        publish(snapshot());
      }).catch(error => {
        const message = String(error?.message || error || 'Comando recusado.');
        lastError = message;
        send({ type: 'ack', id, ok: false, error: message });
        report();
      });
    });
    socket.once('error', error => {
      connecting = false;
      lastError = String(error?.message || 'Falha no relay remoto.');
      logger.warn?.('[remote-relay]', lastError);
      report();
    });
    socket.once('close', () => {
      connecting = false;
      if (ws === socket) ws = null;
      report();
      schedule();
    });
  }

  return {
    start() { stopped = false; connect(); return info(); },
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; closeSocket(); report(); },
    publish,
    info,
  };
}

module.exports = { createRemoteRelay, relayUrl };
