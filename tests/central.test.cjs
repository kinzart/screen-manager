'use strict';

// Integração HTTP da Central: migração, fila de sessões por tela, comandos idempotentes,
// override, espelho, telemetria, revogação, plano/manifesto e hash de mídia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createStudioServer } = require('../web/server');
const { StudioStore, migrateDatabase } = require('../web/store');

const PASSWORD = 'central-test-password-only-2026';
const ORIGIN = 'http://studio.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const pngVariant = n => Buffer.concat([PNG, Buffer.from(`variant-${n}`)]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const S = 1000;

async function startServer(t, dataDir, clock) {
  const app = await createStudioServer({ dataDir, adminPassword: PASSWORD, publicOrigin: ORIGIN, secureCookies: false, now: () => clock.now });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  return { app, base };
}

function client(base) {
  const cookies = new Map();
  return {
    csrf: undefined,
    async request(route, body, { method = body === undefined ? 'GET' : 'POST', expected = 200, raw = false, headers = {} } = {}) {
      const all = { Origin: ORIGIN, ...headers };
      if (cookies.size) all.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      if (this.csrf) all['X-FBS-CSRF'] = this.csrf;
      if (body !== undefined && !raw) all['Content-Type'] = 'application/json';
      const response = await fetch(base + route, { method, headers: all, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
      for (const value of response.headers.getSetCookie()) {
        const [pair] = value.split(';');
        cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      let json;
      try { json = JSON.parse(bytes.toString()); } catch { /* binário */ }
      assert.equal(response.status, expected, `${method} ${route}: ${bytes.toString().slice(0, 300)}`);
      return { body: json, bytes };
    },
  };
}

async function setup(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-central-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const clock = { now: Date.UTC(2026, 10, 23, 12, 0, 0) };
  const { app, base } = await startServer(t, dataDir, clock);
  const owner = client(base);
  owner.csrf = (await owner.request('/api/v1/login', { password: PASSWORD })).body.csrf;
  const space = (await owner.request('/api/v1/spaces', { name: 'Evento' }, { expected: 201 })).body;
  async function upload(name, bytes) {
    const created = (await owner.request('/api/v1/uploads', { spaceId: space.id, name, size: bytes.length, mime: 'image/png' }, { expected: 201 })).body;
    await owner.request(`/api/v1/uploads/${created.id}`, bytes, { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
    return (await owner.request(`/api/v1/uploads/${created.id}/complete`, {}, { expected: 201 })).body;
  }
  async function playlist(name, items) {
    const created = (await owner.request('/api/v1/playlists', { spaceId: space.id, name }, { expected: 201 })).body;
    return (await owner.request(`/api/v1/playlists/${created.id}`, { version: created.version, items, loop: true }, { method: 'PUT' })).body;
  }
  async function pair(name) {
    const tv = client(base);
    const pairing = (await tv.request('/api/v1/pairing', { name }, { expected: 201 })).body;
    const node = (await owner.request(`/api/v1/spaces/${space.id}/pairings/${pairing.id}/approve`, { name }, { expected: 201 })).body;
    tv.csrf = (await tv.request(`/api/v1/pairing/${pairing.id}/claim`, { challenge: pairing.challenge })).body.csrf;
    return { tv, node };
  }
  const screenState = async tv => (await tv.request('/api/v1/state?role=screen')).body;
  const operatorScreen = async id => (await owner.request(`/api/v1/state?spaceId=${space.id}`)).body.screens.find(screen => screen.id === id);
  const screenRecord = id => app.store.db.screens[id];
  return { app, base, clock, owner, space, upload, playlist, pair, screenState, operatorScreen, screenRecord, dataDir };
}

test('migração v1 → v2: backup idêntico byte a byte, dados preservados, versão futura recusada', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-migrate-'));
  try {
    const v1 = {
      schemaVersion: 1, revision: 7,
      spaces: { s: { id: 's', name: 'Antigo', createdAt: 1 } },
      playlists: { p: { id: 'p', spaceId: 's', name: 'Culto', version: 3, items: [], loop: true, position: { x: 1, y: 2 }, transport: { playing: false, positionMs: 0, anchorAtMs: 1, mode: 'media' } } },
      screens: { t: { id: 't', spaceId: 's', name: 'Telão', version: 2, routeRevision: 4, input: { kind: 'playlist', id: 'p' }, position: { x: 3, y: 4 }, createdAt: 1 } },
      media: { m: { id: 'm', spaceId: 's', name: 'a.png', type: 'image', mime: 'image/png', extension: 'png', size: 10, createdAt: 1 } },
      uploads: {}, sessions: {}, pairings: {},
    };
    const original = JSON.stringify(v1, null, 1);
    await fs.writeFile(path.join(dataDir, 'state.json'), original);
    const store = await StudioStore.open({ dataDir, adminPassword: PASSWORD, now: () => 1234 });
    assert.equal(store.migratedFrom, 1);
    assert.equal(await fs.readFile(path.join(dataDir, 'state.v1-1234.json'), 'utf8'), original);
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'state.json'), 'utf8'));
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.revision, 7);
    assert.deepEqual(saved.screens.t.input, { kind: 'playlist', id: 'p' });
    assert.equal(saved.screens.t.program, null);
    assert.deepEqual(saved.screens.t.commands, []);
    assert.equal(saved.media.m.sha256, null);
    assert.equal(saved.playlists.p.name, 'Culto');
    await store.close();
    // Reabrir v2 não cria outro backup.
    const again = await StudioStore.open({ dataDir, adminPassword: PASSWORD, now: () => 9999 });
    assert.equal(again.migratedFrom, undefined);
    await again.close();
    await assert.rejects(fs.access(path.join(dataDir, 'state.v2-9999.json')));
    assert.throws(() => migrateDatabase({ schemaVersion: 3 }), /não suportada/);
    await fs.writeFile(path.join(dataDir, 'state.json'), JSON.stringify({ ...saved, schemaVersion: 3 }));
    await assert.rejects(StudioStore.open({ dataDir, adminPassword: PASSWORD }), /não suportada/);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('fila de sessões por tela: plano, autorização de pré-carga, ACK, versões e validação', async (t) => {
  const c = await setup(t);
  const [m1, m2, m3, m4] = [await c.upload('a1.png', pngVariant(1)), await c.upload('a2.png', pngVariant(2)),
    await c.upload('b1.png', pngVariant(3)), await c.upload('x.png', pngVariant(4))];
  assert.equal(m1.sha256, sha(pngVariant(1)), 'hash do arquivo inteiro');
  assert.deepEqual(m1.chunks, [sha(pngVariant(1))], 'arquivo pequeno = um bloco');
  const A = await c.playlist('A', [{ mediaId: m1.id, durationMs: 10 * S }, { mediaId: m2.id, durationMs: 20 * S }]);
  const B = await c.playlist('B', [{ mediaId: m3.id, durationMs: 5 * S }]);
  const X = await c.playlist('X', [{ mediaId: m4.id, durationMs: 5 * S }]);
  const { tv, node } = await c.pair('Telão');
  await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: node.version + 5, program: { entries: [] } }, { method: 'PUT', expected: 409 });
  await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: node.version, program: {
    entries: [{ playlistId: X.id, repeat: { mode: 'loop' } }, { playlistId: A.id }],
  } }, { method: 'PUT', expected: 400 });
  const saved = (await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: node.version, program: {
    entries: [{ id: 'first', playlistId: A.id }, { id: 'second', playlistId: B.id, repeat: { mode: 'count', count: 2 } }],
  } }, { method: 'PUT' })).body;
  assert.equal(saved.program.entries.length, 2);

  let state = await c.screenState(tv);
  assert.equal(state.protocol, 2);
  assert.equal(state.screen.origin, 'program');
  assert.equal(state.output.item.mediaId, m1.id);
  assert.ok(state.plan && state.planHash);
  assert.deepEqual(Object.keys(state.plan.playlists).sort(), [A.id, B.id].sort());
  const cached = await tv.request(`/api/v1/state?role=screen&plan=${state.planHash}`);
  assert.equal(cached.body.plan, undefined, 'plano omitido quando o hash coincide');
  // Pré-carga: mídia da próxima sessão é autorizada; de fora do plano é negada.
  assert.deepEqual((await tv.request(`/api/v1/media/${m3.id}?role=screen`)).bytes, pngVariant(3));
  await tv.request(`/api/v1/media/${m4.id}?role=screen`, undefined, { expected: 403 });

  await tv.request('/api/v1/screens/self/ack', { routeVersion: state.screen.routeVersion, playlistVersion: state.source.version, status: 'playing', mediaId: m1.id });
  let operator = await c.operatorScreen(node.id);
  assert.equal(operator.status, 'playing');
  assert.equal(operator.programState.entryId, 'first');

  c.clock.now += 30 * S;
  state = await c.screenState(tv);
  assert.equal(state.output.item.mediaId, m3.id);
  assert.equal(state.screen.entryId, 'second');
  operator = await c.operatorScreen(node.id);
  assert.equal(operator.ack, null, 'ACK da sessão anterior não vale para a atual');
  await tv.request('/api/v1/screens/self/ack', { routeVersion: 'old', playlistVersion: state.source.version, status: 'playing' }, { expected: 409 });

  c.clock.now += 10 * S;
  state = await c.screenState(tv);
  assert.equal(state.output, null, 'fim da programação com endBehavior stop e sem rota = ocioso');

  // Editar a duração de uma sessão que JÁ tocou não reescreve o passado (o cursor é fixado antes da edição).
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'restart' }, { expected: 201 });
  c.clock.now += 35 * S;
  let operatorView = await c.operatorScreen(node.id);
  assert.equal(operatorView.programState.entryId, 'second');
  assert.equal(operatorView.programState.offsetMs, 5 * S);
  const current = c.app.store.db.playlists[A.id];
  await c.owner.request(`/api/v1/playlists/${A.id}`, { version: current.version, items: [{ mediaId: m1.id, durationMs: 100 * S }] }, { method: 'PUT' });
  operatorView = await c.operatorScreen(node.id);
  assert.equal(operatorView.programState.entryId, 'second', 'sem fixar o cursor, A (agora 100 s) voltaria ao ar');
  assert.equal(operatorView.programState.offsetMs, 5 * S);
});

test('comandos idempotentes, estados recebido/executado, pausa, override, item e espelho', async (t) => {
  const c = await setup(t);
  const [m1, m2, m3] = [await c.upload('a1.png', pngVariant(1)), await c.upload('a2.png', pngVariant(2)), await c.upload('b1.png', pngVariant(3))];
  const A = await c.playlist('A', [{ mediaId: m1.id, durationMs: 10 * S }, { mediaId: m2.id, durationMs: 20 * S }]);
  const B = await c.playlist('B', [{ mediaId: m3.id, durationMs: 5 * S }]);
  const { tv, node } = await c.pair('Principal');
  const { tv: tv2, node: mirror } = await c.pair('Espelho');
  const legacy = await c.pair('Legado');
  await c.owner.request(`/api/v1/screens/${legacy.node.id}/commands`, { commandId: randomUUID(), action: 'pause' }, { expected: 409 });
  await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: node.version, program: {
    entries: [{ id: 'one', playlistId: A.id, repeat: { mode: 'loop' }, endAfterMs: 120 * S }, { id: 'two', playlistId: B.id, repeat: { mode: 'loop' } }],
  } }, { method: 'PUT' });
  await c.owner.request(`/api/v1/screens/${mirror.id}/route`, { version: mirror.version, input: { kind: 'screen', id: node.id } }, { method: 'PUT' });

  const commandId = randomUUID();
  const first = await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId, action: 'next-session' }, { expected: 201 });
  assert.equal(first.body.duplicate, false);
  let operator = await c.operatorScreen(node.id);
  assert.equal(operator.lastCommand.status, 'accepted');
  assert.equal(operator.programState.entryId, 'two');
  const again = await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId, action: 'next-session' });
  assert.equal(again.body.duplicate, true);
  assert.equal((await c.operatorScreen(node.id)).programState.entryId, 'two', 'repetir o commandId não reaplica');

  let state = await c.screenState(tv);
  operator = await c.operatorScreen(node.id);
  assert.equal(operator.lastCommand.status, 'delivered');
  await tv.request('/api/v1/screens/self/ack', { routeVersion: state.screen.routeVersion, playlistVersion: state.source.version, status: 'playing', mediaId: m3.id });
  operator = await c.operatorScreen(node.id);
  assert.equal(operator.lastCommand.status, 'executed');

  // Espelho acompanha a saída efetiva (programa) da tela de origem.
  const mirrored = await c.screenState(tv2);
  assert.equal(mirrored.output.item.mediaId, m3.id);

  // Pausa congela sem remontar (routeVersion igual); play retoma do mesmo ponto.
  c.clock.now += 2 * S;
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'pause' }, { expected: 201 });
  const paused = await c.screenState(tv);
  assert.equal(paused.output.playing, false);
  assert.equal(paused.screen.routeVersion, state.screen.routeVersion);
  assert.notEqual(paused.source.version, state.source.version, 'ACK anterior à pausa fica obsoleto');
  c.clock.now += 60 * S;
  assert.equal((await c.screenState(tv)).output.positionMs, 2 * S);
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'play' }, { expected: 201 });
  c.clock.now += 1 * S;
  const resumed = await c.screenState(tv);
  assert.equal(resumed.output.playing, true);
  assert.equal(resumed.output.positionMs, 3 * S);

  // Override manual e retomada em tempo de parede.
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'take', playlistId: A.id }, { expected: 201 });
  state = await c.screenState(tv);
  assert.equal(state.screen.origin, 'override');
  assert.equal(state.output.item.mediaId, m1.id);
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'next-item' }, { expected: 201 });
  assert.equal((await c.screenState(tv)).output.item.mediaId, m2.id, 'próximo item dentro da sessão (nível 1)');
  c.clock.now += 4 * S;
  await c.owner.request(`/api/v1/screens/${node.id}/commands`, { commandId: randomUUID(), action: 'release' }, { expected: 201 });
  state = await c.screenState(tv);
  assert.equal(state.screen.origin, 'program');
  assert.equal(state.screen.entryId, 'two');
  assert.equal(state.output.positionMs, (3 + 4) * S % (5 * S), 'programa continuou correndo durante o override');

  // Excluir uma sessão remove suas entradas e o override.
  await c.owner.request(`/api/v1/playlists/${B.id}`, undefined, { method: 'DELETE' });
  const program = c.screenRecord(node.id).program;
  assert.deepEqual(program.entries.map(entry => entry.id), ['one']);
});

test('telemetria, identidade do aparelho, revogação sem apagar a tela e troca de aparelho', async (t) => {
  const c = await setup(t);
  const { tv, node } = await c.pair('Projetor');
  await tv.request('/api/v1/screens/self/heartbeat', {
    protocol: 2, deviceId: 'device-abc-123', app: { name: 'tela-fbs-web', version: '1.1.0' }, platform: 'Android 11',
    cache: { supported: true, ready: 2, total: 3, bytesReady: 100, bytesTotal: 300, errors: ['x'.repeat(500)] },
    storage: { usage: 1000, quota: 5000 }, evil: '<script>',
  });
  const operator = await c.operatorScreen(node.id);
  assert.equal(operator.telemetry.cache.ready, 2);
  assert.equal(operator.telemetry.cache.errors[0].length, 200);
  assert.equal(operator.telemetry.evil, undefined);
  assert.equal(operator.protocol, 2);
  assert.equal(c.screenRecord(node.id).device.deviceId, 'device-abc-123');
  await c.owner.request(`/api/v1/screens/${node.id}/revoke`, {});
  await tv.request('/api/v1/state?role=screen', undefined, { expected: 401 });
  assert.ok(c.screenRecord(node.id), 'a tela continua existindo');
  assert.ok(c.screenRecord(node.id).device.revokedAt);
  // Novo aparelho assume a mesma tela, preservando a configuração.
  const replacement = client(c.base);
  const pairing = (await replacement.request('/api/v1/pairing', { name: 'Novo' }, { expected: 201 })).body;
  const bound = (await c.owner.request(`/api/v1/spaces/${c.space.id}/pairings/${pairing.id}/approve`, { screenId: node.id }, { expected: 201 })).body;
  assert.equal(bound.id, node.id);
  replacement.csrf = (await replacement.request(`/api/v1/pairing/${pairing.id}/claim`, { challenge: pairing.challenge })).body.csrf;
  assert.equal((await c.screenState(replacement)).screen.id, node.id);
});

test('manifesto lista mídias do plano na ordem de uso com hashes por bloco', async (t) => {
  const c = await setup(t);
  const [m1, m2] = [await c.upload('a.png', pngVariant(1)), await c.upload('b.png', pngVariant(2))];
  const A = await c.playlist('A', [{ mediaId: m1.id, durationMs: 5 * S }]);
  const B = await c.playlist('B', [{ mediaId: m2.id, durationMs: 5 * S }]);
  const { tv, node } = await c.pair('Tela');
  await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: node.version, program: {
    entries: [{ playlistId: A.id }, { playlistId: B.id }],
  } }, { method: 'PUT' });
  let manifest = (await tv.request('/api/v1/screens/self/manifest')).body;
  assert.deepEqual(manifest.files.map(file => file.id), [m1.id, m2.id]);
  // Regressão: repeat com sessões curtas não pode esconder a sessão agendada para +1 h (plano compacto).
  const m3 = await c.upload('later.png', pngVariant(3));
  const later = await c.playlist('Later', [{ mediaId: m3.id, durationMs: 5 * S }]);
  const screen = c.screenRecord(node.id);
  await c.owner.request(`/api/v1/screens/${node.id}/program`, { version: screen.version, program: {
    endBehavior: 'repeat',
    entries: [{ playlistId: A.id }, { playlistId: B.id }, { playlistId: later.id, start: { type: 'at', atMs: c.clock.now + 3600 * S } }],
  } }, { method: 'PUT' });
  manifest = (await tv.request('/api/v1/screens/self/manifest')).body;
  assert.deepEqual(manifest.files.map(file => file.id), [m1.id, m2.id, m3.id]);
  const state = (await tv.request('/api/v1/state?role=screen')).body;
  assert.ok(state.plan.segments.some(segment => segment.kind === 'cycle'));
  assert.ok(state.plan.segments.length < 20);
  assert.ok(state.plan.horizonEndMs >= c.clock.now + 5 * 3600 * S, 'cobertura de horas, não minutos');
  assert.deepEqual((await tv.request(`/api/v1/media/${m3.id}?role=screen`)).bytes, pngVariant(3));
  assert.equal(manifest.files[1].sha256, sha(pngVariant(2)));
  assert.equal(manifest.files[1].chunkSize, 8 * 1024 * 1024);
  assert.ok(manifest.planHash);
});

test('senha do operador: PIN de 6 números aceito e bloqueio global após 10 senhas erradas', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-pin-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  for (const weak of ['12345', '1234567', 'abcdef', 'senha-curta']) {
    await assert.rejects(StudioStore.open({ dataDir, adminPassword: weak }), /6 números ou com pelo menos 16/, weak);
  }
  const clock = { now: Date.UTC(2026, 10, 24, 12, 0, 0) };
  const app = await createStudioServer({ dataDir, adminPassword: '482913', publicOrigin: ORIGIN, secureCookies: false, now: () => clock.now, backfillHashes: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const owner = client(base);
  owner.csrf = (await owner.request('/api/v1/login', { password: '482913' })).body.csrf;
  const stranger = client(base);
  for (let i = 0; i < 10; i++) await stranger.request('/api/v1/login', { password: String(100000 + i) }, { expected: 401 });
  // Bloqueado para todos, inclusive com o PIN certo.
  await client(base).request('/api/v1/login', { password: '482913' }, { expected: 429 });
  // Quem já estava logado continua operando.
  await owner.request('/api/v1/spaces', { name: 'Durante o bloqueio' }, { expected: 201 });
  // Passada a janela de 15 minutos, o PIN certo volta a funcionar.
  clock.now += 15 * 60 * 1000 + 1;
  await client(base).request('/api/v1/login', { password: '482913' });
});
