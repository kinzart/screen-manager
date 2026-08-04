// Testes do RemoteDesktopAdapter com WebSocket e fetch FAKES (nunca rede
// real) — mesma estratégia de injeção de dependência usada em
// CapacitorMedia.test.js/WebMediaAdapter.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteDesktopAdapter } from '../../www/app/adapters/RemoteDesktopAdapter.js';
import { MediaPort } from '../../www/app/core/ports.js';

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.listeners = {};
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this._emit('open'));
  }
  addEventListener(event, cb) {
    (this.listeners[event] ||= []).push(cb);
  }
  send(data) { this.sent.push(data); }
  close() { this._emit('close'); }
  _emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload || {}));
  }
  _receiveServerMessage(obj) {
    this._emit('message', { data: JSON.stringify(obj) });
  }
}
FakeWebSocket.instances = [];

class FakeMedia extends MediaPort {
  constructor(blob) { super(); this._blob = blob; }
  async readBlob() { return this._blob; }
}

function makeItem(overrides = {}) {
  return {
    name: 'foto.png',
    type: 'image',
    fit: 'contain',
    transition: '',
    duration: 10,
    media: { storage: 'sandbox', relPath: 'library/a.png', mime: 'image/png', bytes: 4 },
    ...overrides,
  };
}

function fakeFetch(responses) {
  let call = 0;
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const response = responses[call++] || responses[responses.length - 1];
    return response;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('construtor exige serverUrl, room e media', () => {
  assert.throws(() => new RemoteDesktopAdapter({ room: '1234', media: new FakeMedia(), WebSocketImpl: FakeWebSocket, fetchImpl: async () => {} }));
  assert.throws(() => new RemoteDesktopAdapter({ serverUrl: 'https://x', media: new FakeMedia(), WebSocketImpl: FakeWebSocket, fetchImpl: async () => {} }));
  assert.throws(() => new RemoteDesktopAdapter({ serverUrl: 'https://x', room: '1234', WebSocketImpl: FakeWebSocket, fetchImpl: async () => {} }));
});

test('conecta ao WebSocket correto (role=controller, room, protocolo derivado de https)', () => {
  FakeWebSocket.instances.length = 0;
  new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '4821', media: new FakeMedia(),
    WebSocketImpl: FakeWebSocket, fetchImpl: fakeFetch([]),
  });
  const ws = FakeWebSocket.instances[0];
  assert.equal(ws.url, 'wss://relay.exemplo.com/ws?role=controller&room=4821');
});

test('show(): faz upload da mídia uma única vez (cache por relPath) e envia comando "show" com a URL', async () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  const fetchImpl = fakeFetch([jsonResponse(200, { mediaId: 'abc', url: '/media/4821/abc' })]);
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '4821', media: new FakeMedia(blob),
    WebSocketImpl: FakeWebSocket, fetchImpl,
  });
  await adapter.show(makeItem());
  await adapter.show(makeItem()); // segunda vez: mesmo relPath, não deve reenviar

  assert.equal(fetchImpl.calls.length, 1, 'upload deveria acontecer só uma vez para o mesmo relPath');
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  const sentCommands = ws.sent.map((s) => JSON.parse(s));
  assert.equal(sentCommands.length, 2);
  assert.equal(sentCommands[0].action, 'show');
  assert.equal(sentCommands[0].item.mediaUrl, 'https://relay.exemplo.com/media/4821/abc');
  assert.equal(sentCommands[0].item.name, 'foto.png');
});

test('show(): falha de upload emite status de erro em vez de lançar', async () => {
  const fetchImpl = fakeFetch([jsonResponse(500, {})]);
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '4821', media: new FakeMedia(new Blob(['x'])),
    WebSocketImpl: FakeWebSocket, fetchImpl,
  });
  const statuses = [];
  adapter.onStatus((s) => statuses.push(s));
  await assert.doesNotReject(() => adapter.show(makeItem()));
  assert.equal(statuses.length, 1);
  assert.match(statuses[0].error, /foto\.png/);
});

test('blackout/logo/pause/resume/clear enviam o comando correto', async () => {
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '1111', media: new FakeMedia(),
    WebSocketImpl: FakeWebSocket, fetchImpl: fakeFetch([]),
  });
  await adapter.blackout();
  await adapter.logo();
  await adapter.pause();
  await adapter.resume();
  await adapter.clear();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  const actions = ws.sent.map((s) => JSON.parse(s).action);
  assert.deepEqual(actions, ['blackout', 'logo', 'pause', 'resume', 'clear']);
});

test('mensagem {type:"status", error} vinda do display dispara onStatus', async () => {
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '2222', media: new FakeMedia(),
    WebSocketImpl: FakeWebSocket, fetchImpl: fakeFetch([]),
  });
  const statuses = [];
  adapter.onStatus((s) => statuses.push(s));
  await new Promise((resolve) => queueMicrotask(resolve));
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  ws._receiveServerMessage({ type: 'status', error: 'Não foi possível reproduzir o vídeo.' });
  assert.equal(statuses.length, 1);
  assert.match(statuses[0].error, /vídeo/);
});

test('capabilities(): sempre remote=true, fullscreen=false (quem apresenta é a TV, não o celular)', () => {
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '3333', media: new FakeMedia(),
    WebSocketImpl: FakeWebSocket, fetchImpl: fakeFetch([]),
  });
  assert.deepEqual(adapter.capabilities(), { fullscreen: false, remote: true, secondScreen: true });
});

test('disconnect(): fecha o WebSocket', () => {
  const adapter = new RemoteDesktopAdapter({
    serverUrl: 'https://relay.exemplo.com', room: '4444', media: new FakeMedia(),
    WebSocketImpl: FakeWebSocket, fetchImpl: fakeFetch([]),
  });
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  let closed = false;
  ws.addEventListener('close', () => { closed = true; });
  adapter.disconnect();
  assert.equal(closed, true);
});
