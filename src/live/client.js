(() => {
  const role = document.body.dataset.role;
  const byId = id => document.getElementById(id);
  const pending = new Map();
  let ws, timer, attempt = 0, generation = 0, nextId = 0, paired = false, justPaired = false;
  const pairingHint = 'fbs-paired-' + role;
  try { paired = localStorage.getItem(pairingHint) === 'yes'; } catch {}
  if (paired) { byId('pairPanel').hidden = true; byId('session').hidden = false; }
  const connected = () => ws?.readyState === WebSocket.OPEN;
  const status = text => { byId('netStatus').textContent = text; };
  function disconnect() {
    generation++;
    clearTimeout(timer);
    const old = ws;
    ws = null;
    if (old) { old.onclose = null; old.close(); }
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Conexão interrompida. Confira o estado ao reconectar.'));
    }
    pending.clear();
    document.body.dataset.connected = 'false';
    window.dispatchEvent(new Event('fbs-disconnected'));
  }
  function retry() {
    disconnect();
    status('Sem conexão · tentando novamente…');
    timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4)));
  }
  async function connect() {
    disconnect();
    const ticket = generation;
    const timeout = new AbortController();
    const deadline = setTimeout(() => timeout.abort(), 7000);
    let session;
    try {
      const res = await fetch('/api/session?role=' + role, { signal: timeout.signal, cache: 'no-store' });
      if (!res.ok) throw new Error();
      session = await res.json();
    } catch {
      if (ticket === generation) retry();
      return;
    } finally { clearTimeout(deadline); }
    if (ticket !== generation) return;
    paired = session.paired;
    try { if (paired) localStorage.setItem(pairingHint, 'yes'); else localStorage.removeItem(pairingHint); } catch {}
    byId('pairPanel').hidden = paired;
    byId('session').hidden = !paired;
    if (!paired) { status('Aguardando pareamento'); return; }
    status('Conectando…');
    const url = new URL('/live/' + role, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = ws = new WebSocket(url);
    timer = setTimeout(() => { if (ws === socket && !connected()) retry(); }, 9000);
    socket.onopen = () => {
      clearTimeout(timer); attempt = 0;
      document.body.dataset.connected = 'true'; status('Conectado');
      window.dispatchEvent(new Event('fbs-connected'));
    };
    socket.onmessage = ({ data }) => {
      const frame = JSON.parse(data);
      if (frame.state) window.dispatchEvent(new CustomEvent('fbs-state', { detail: frame.state }));
      else if (pending.has(frame.ack)) {
        const request = pending.get(frame.ack); pending.delete(frame.ack); clearTimeout(request.timeout);
        if (frame.error) request.reject(new Error(frame.error)); else request.resolve();
      }
    };
    socket.onclose = () => { if (socket === ws) retry(); };
  }
  byId('pairForm').addEventListener('submit', async event => {
    event.preventDefault();
    const error = byId('pairError');
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    error.textContent = '';
    try {
      const res = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, code: byId('pairCode').value.trim() }) });
      if (!res.ok) throw new Error((await res.json()).error);
      byId('pairCode').value = '';
      justPaired = true;
      await connect();
    } catch (failure) { error.textContent = failure.message || 'Não foi possível conectar.'; }
    finally { if (submit) submit.disabled = false; }
  });
  window.fbsLive = {
    get connected() { return connected(); },
    command(command) {
      if (!connected()) return Promise.reject(new Error('Aguardando a conexão com o computador.'));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Confira no painel se o comando chegou.')); }, 12000);
        pending.set(id, { resolve, reject, timeout });
        ws.send(JSON.stringify({ id, command }));
      });
    },
    async upload(file) {
      if (!connected()) throw new Error('Aguardando a conexão com o computador.');
      const res = await fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file });
      if (!res.ok) throw new Error((await res.json()).error);
    }
  };
  if (role === 'tv') {
    const button = byId('fullscreen');
    button.hidden = true;
    let hide;
    const reveal = () => {
      if (!paired) return;
      button.hidden = false;
      clearTimeout(hide);
      hide = setTimeout(() => { button.hidden = true; }, 4500);
    };
    button.onclick = () => {
      const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (request) Promise.resolve(request.call(document.documentElement)).catch(() => status('Use a tela cheia do navegador.'));
      button.hidden = true;
    };
    document.addEventListener('pointerdown', reveal);
    document.addEventListener('keydown', event => {
      if (!paired || event.key === 'Escape') return;
      reveal(); button.focus();
    });
    window.addEventListener('fbs-connected', () => {
      if (justPaired && !document.fullscreenElement) reveal();
      justPaired = false;
    });
  }
  window.addEventListener('online', connect);
  window.addEventListener('offline', retry);
  window.addEventListener('pagehide', disconnect);
  window.addEventListener('pageshow', e => { if (e.persisted) connect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && paired) connect(); });
  if (window.isSecureContext && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  connect();
})();
