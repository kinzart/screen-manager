const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createStudioServer } = require('../web/server');
const { StudioStore } = require('../web/store');
const { playlistPosition, resolveScreen, validateRoute } = require('../web/engine');

const PASSWORD = 'studio-test-password-only-2026';
const ORIGIN = 'http://studio.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

test('FBS Studio: authoritative routes, protected media and restart persistence', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-studio-http-'));
  let clock = Date.now();
  let app;
  let base;
  async function start() {
    app = await createStudioServer({ dataDir, adminPassword: PASSWORD, publicOrigin: ORIGIN, secureCookies: false, now: () => clock });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  function client() {
    const cookies = new Map();
    let csrf;
    return {
      cookies,
      set csrf(value) { csrf = value; },
      get csrf() { return csrf; },
      async request(route, body, { method = body === undefined ? 'GET' : 'POST', expected = 200, headers = {}, raw = false, origin = ORIGIN, withCsrf = true } = {}) {
        const allHeaders = { Origin: origin, ...headers };
        if (cookies.size) allHeaders.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        if (csrf && withCsrf) allHeaders['X-FBS-CSRF'] = csrf;
        if (body !== undefined && !raw) allHeaders['Content-Type'] = 'application/json';
        const response = await fetch(base + route, { method, headers: allHeaders, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
        for (const value of response.headers.getSetCookie()) {
          const [pair] = value.split(';');
          const split = pair.indexOf('=');
          cookies.set(pair.slice(0, split), pair.slice(split + 1));
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        let json;
        try { json = JSON.parse(bytes.toString()); } catch { /* binary and HEAD */ }
        assert.equal(response.status, expected, `${method} ${route}: ${bytes.toString().slice(0, 350)}`);
        return { body: json, bytes, headers: response.headers };
      },
      async login() {
        const result = await this.request('/api/v1/login', { password: PASSWORD });
        csrf = result.body.csrf;
        return result;
      },
    };
  }
  await start();
  t.after(async () => {
    if (app) await app.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const owner = client();
  const stranger = client();
  const tv1 = client();
  const tv2 = client();
  const tvOther = client();
  const createSpace = async name => (await owner.request('/api/v1/spaces', { name }, { expected: 201 })).body;
  const state = async spaceId => (await owner.request(`/api/v1/state?spaceId=${spaceId}`)).body;
  async function pair(receiver, spaceId, name) {
    const pairing = (await receiver.request('/api/v1/pairing', { name }, { expected: 201 })).body;
    assert.match(pairing.code, /^\d{6}$/);
    await receiver.request(`/api/v1/pairing/${pairing.id}`, undefined, { headers: { 'X-FBS-Pairing': 'wrong' }, expected: 403 });
    const node = (await owner.request(`/api/v1/spaces/${spaceId}/pairings/${pairing.id}/approve`, { name }, { expected: 201 })).body;
    const claimed = await receiver.request(`/api/v1/pairing/${pairing.id}/claim`, { challenge: pairing.challenge });
    receiver.csrf = claimed.body.csrf;
    assert.equal(claimed.body.screenId, node.id);
    await receiver.request(`/api/v1/pairing/${pairing.id}/claim`, { challenge: pairing.challenge }, { expected: 409 });
    return node;
  }
  async function upload(spaceId, name = 'pixel.png', bytes = PNG, mime = 'image/png') {
    const created = (await owner.request('/api/v1/uploads', { spaceId, name, size: bytes.length, mime }, { expected: 201 })).body;
    assert.equal(created.chunkSize, 2 * 1024 * 1024);
    const half = Math.floor(bytes.length / 2);
    await owner.request(`/api/v1/uploads/${created.id}`, bytes.subarray(0, half), { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
    const resume = (await owner.request(`/api/v1/uploads/${created.id}`)).body;
    assert.equal(resume.offset, half);
    await owner.request(`/api/v1/uploads/${created.id}`, bytes.subarray(half), { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' }, expected: 409 });
    await owner.request(`/api/v1/uploads/${created.id}`, bytes.subarray(half), { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(half) } });
    return (await owner.request(`/api/v1/uploads/${created.id}/complete`, {}, { expected: 201 })).body;
  }

  await t.test('password, CSRF and foreign origins are enforced', async () => {
    await stranger.request('/api/v1/state', undefined, { expected: 401 });
    assert.equal((await stranger.request('/api/v1/me')).body.authenticated, false);
    await stranger.request('/api/v1/login', { password: 'bad' }, { expected: 401 });
    await owner.login();
    assert.ok(owner.csrf);
    await owner.request('/api/v1/spaces', { name: 'forbidden' }, { withCsrf: false, expected: 403 });
    await owner.request('/api/v1/spaces', { name: 'forbidden' }, { origin: 'http://evil.test', expected: 403 });
  });

  const space = await createSpace('Evento principal');
  const other = await createSpace('Evento privado');
  let screen1 = await pair(tv1, space.id, 'Projetor');
  let screen2 = await pair(tv2, space.id, 'Notebook Windows');
  const screenOther = await pair(tvOther, other.id, 'Tela privada');
  let media;
  let playlist;
  await t.test('uploads resume safely and media supports byte ranges', async () => {
    media = await upload(space.id);
    assert.equal(media.type, 'image');
    assert.equal(media.size, PNG.length);
    assert.equal((await owner.request(`/api/v1/media/${media.id}`)).bytes.compare(PNG), 0);
    const range = await owner.request(`/api/v1/media/${media.id}`, undefined, { headers: { Range: 'bytes=3-10' }, expected: 206 });
    assert.equal(range.bytes.compare(PNG.subarray(3, 11)), 0);
    assert.equal(range.headers.get('content-range'), `bytes 3-10/${PNG.length}`);
    const suffix = await owner.request(`/api/v1/media/${media.id}`, undefined, { headers: { Range: 'bytes=-5' }, expected: 206 });
    assert.equal(suffix.bytes.compare(PNG.subarray(-5)), 0);
    await owner.request(`/api/v1/media/${media.id}`, undefined, { headers: { Range: 'bytes=999999-' }, expected: 416 });
    assert.equal((await owner.request(`/api/v1/media/${media.id}`, undefined, { method: 'HEAD' })).bytes.length, 0);
    await stranger.request(`/api/v1/media/${media.id}`, undefined, { expected: 401 });
    const bad = (await owner.request('/api/v1/uploads', { spaceId: space.id, name: 'fake.png', size: 8, mime: 'image/png' }, { expected: 201 })).body;
    await owner.request(`/api/v1/uploads/${bad.id}`, Buffer.from('<script>'), { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
    await owner.request(`/api/v1/uploads/${bad.id}/complete`, {}, { expected: 415 });
    await owner.request(`/api/v1/uploads/${bad.id}`, undefined, { method: 'DELETE' });
  });

  await t.test('an interrupted binary block is rolled back and can be retried', async () => {
    const pending = (await owner.request('/api/v1/uploads', { spaceId: space.id, name: 'interrupted.png', size: PNG.length, mime: 'image/png' }, { expected: 201 })).body;
    const request = http.request(base + `/api/v1/uploads/${pending.id}`, {
      method: 'PATCH', headers: {
        Origin: ORIGIN, 'Content-Type': 'application/octet-stream', 'Content-Length': PNG.length,
        'Upload-Offset': '0', 'X-FBS-CSRF': owner.csrf,
        Cookie: [...owner.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      },
    });
    request.on('error', () => {});
    request.write(PNG.subarray(0, 16));
    const partial = path.join(dataDir, 'uploads', pending.id + '.part');
    for (let i = 0; i < 60 && (await fs.stat(partial)).size === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await fs.stat(partial)).size, 16, 'server received part of the block');
    request.destroy();
    for (let i = 0; i < 60 && (await fs.stat(partial)).size !== 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await fs.stat(partial)).size, 0);
    assert.equal((await owner.request(`/api/v1/uploads/${pending.id}`)).body.offset, 0);
    await owner.request(`/api/v1/uploads/${pending.id}`, PNG, { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
    await owner.request(`/api/v1/uploads/${pending.id}/complete`, {}, { expected: 201 });
  });

  await t.test('space quota counts reservations without allocating large buffers', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await owner.request('/api/v1/uploads', { spaceId: other.id, name: `large-${i}.mp4`, size: 512 * 1024 * 1024, mime: 'video/mp4' }, { expected: 201 })).body.id);
    }
    await owner.request('/api/v1/uploads', { spaceId: other.id, name: 'too-large.mp4', size: 512 * 1024 * 1024 + 1, mime: 'video/mp4' }, { expected: 413 });
    ids.push((await owner.request('/api/v1/uploads', { spaceId: other.id, name: 'last.mp4', size: 512 * 1024 * 1024, mime: 'video/mp4' }, { expected: 201 })).body.id);
    await owner.request('/api/v1/uploads', { spaceId: other.id, name: 'over-quota.png', size: 1, mime: 'image/png' }, { expected: 413 });
    for (const id of ids) await owner.request(`/api/v1/uploads/${id}`, undefined, { method: 'DELETE' });
    await owner.request('/api/v1/uploads', { spaceId: [other.id], name: 'array.png', size: 10, mime: 'image/png' }, { expected: 400 });
    await owner.request('/api/v1/uploads', { spaceId: other.id, name: 'array.png', size: 10, mime: ['image/png'] }, { expected: 415 });
  });

  await t.test('startup repairs a crash between moving bytes and committing metadata', async () => {
    const pending = (await owner.request('/api/v1/uploads', { spaceId: space.id, name: 'crash.png', size: PNG.length, mime: 'image/png' }, { expected: 201 })).body;
    await owner.request(`/api/v1/uploads/${pending.id}`, PNG, { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
    await app.close();
    app = undefined;
    const part = path.join(dataDir, 'uploads', pending.id + '.part');
    const destination = path.join(dataDir, 'media', pending.id + '.png');
    await fs.rename(part, destination);
    const orphan = path.join(dataDir, 'uploads', randomUUID() + '.part');
    await fs.writeFile(orphan, 'uncommitted');
    await start();
    assert.equal((await fs.readFile(part)).compare(PNG), 0);
    await assert.rejects(fs.stat(orphan), error => error.code === 'ENOENT');
    const repaired = (await owner.request(`/api/v1/uploads/${pending.id}/complete`, {}, { expected: 201 })).body;
    assert.equal(repaired.id, pending.id);
    assert.equal((await owner.request(`/api/v1/media/${pending.id}`)).bytes.compare(PNG), 0);
  });

  await t.test('fan-out, mirror chains, optimistic versions and isolation', async () => {
    playlist = (await owner.request('/api/v1/playlists', { spaceId: space.id, name: 'Sessão de abertura' }, { expected: 201 })).body;
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}`, { version: playlist.version, items: [{ id: 'item-1', mediaId: media.id, durationMs: 10000 }, { id: 'item-2', mediaId: media.id, durationMs: 10000 }], loop: true }, { method: 'PUT' })).body;
    screen1 = (await owner.request(`/api/v1/screens/${screen1.id}/route`, { version: screen1.version, input: { kind: 'playlist', id: playlist.id } }, { method: 'PUT' })).body;
    screen2 = (await owner.request(`/api/v1/screens/${screen2.id}/route`, { version: screen2.version, input: { kind: 'playlist', id: playlist.id } }, { method: 'PUT' })).body;
    await owner.request(`/api/v1/screens/${screen1.id}/route`, { version: 1, input: null }, { method: 'PUT', expected: 409 });
    let snap1 = (await tv1.request('/api/v1/state?role=screen')).body;
    let snap2 = (await tv2.request('/api/v1/state?role=screen')).body;
    assert.equal(snap1.screen.sourceId, playlist.id);
    assert.equal(snap2.screen.sourceId, playlist.id);
    assert.equal((await tv1.request(`/api/v1/media/${media.id}?role=screen`)).bytes.compare(PNG), 0);
    await tvOther.request(`/api/v1/media/${media.id}?role=screen`, undefined, { expected: 403 });
    await tv1.request('/api/v1/state?spaceId=' + other.id, undefined, { expected: 401 });
    await tv1.request(`/api/v1/screens/${screenOther.id}/route`, { input: null, version: 1 }, { method: 'PUT', expected: 401 });
    screen2 = (await owner.request(`/api/v1/screens/${screen2.id}/route`, { version: screen2.version, input: { kind: 'screen', id: screen1.id } }, { method: 'PUT' })).body;
    await owner.request(`/api/v1/screens/${screen1.id}/route`, { version: screen1.version, input: { kind: 'screen', id: screen2.id } }, { method: 'PUT', expected: 409 });
    await owner.request(`/api/v1/screens/${screen1.id}/route`, { version: screen1.version, input: { kind: 'screen', id: screenOther.id } }, { method: 'PUT', expected: 400 });
    snap2 = (await tv2.request('/api/v1/state?role=screen')).body;
    assert.equal(snap2.screen.sourceId, playlist.id);
    assert.notEqual(snap2.screen.routeVersion, snap1.screen.routeVersion);
    const snapshot = await state(space.id);
    assert.equal(snapshot.screens.length, 2);
    assert.ok(!JSON.stringify(snapshot).includes('secretHash'));
    assert.ok(!JSON.stringify(snapshot).includes('challengeHash'));
  });

  await t.test('clock, pause, blackout and acknowledgements reflect the receiver', async () => {
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}/transport`, { action: 'play', version: playlist.version })).body;
    clock += 3500;
    let snap = (await tv1.request('/api/v1/state?role=screen')).body;
    assert.equal(snap.output.playing, true);
    assert.equal(snap.output.positionMs, 3500);
    await tv1.request('/api/v1/screens/self/ack', { routeVersion: snap.screen.routeVersion, playlistVersion: snap.source.version, status: 'playing', mediaId: media.id });
    let snapshot = await state(space.id);
    assert.equal(snapshot.screens.find(x => x.id === screen1.id).status, 'playing');
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}/transport`, { action: 'pause', version: playlist.version })).body;
    await tv1.request('/api/v1/screens/self/ack', { routeVersion: snap.screen.routeVersion, playlistVersion: snap.source.version, status: 'playing', mediaId: media.id }, { expected: 409 });
    clock += 3000;
    snap = (await tv1.request('/api/v1/state?role=screen')).body;
    assert.equal(snap.output.positionMs, 3500);
    assert.equal(snap.output.playing, false);
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}/transport`, { action: 'blackout' })).body;
    assert.equal((await tv2.request('/api/v1/state?role=screen')).body.output.mode, 'blackout');
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}/transport`, { action: 'blackout' })).body;
    assert.equal((await tv2.request('/api/v1/state?role=screen')).body.output.mode, 'media');
    playlist = (await owner.request(`/api/v1/playlists/${playlist.id}/transport`, { action: 'next' })).body;
    assert.equal((await tv1.request('/api/v1/state?role=screen')).body.output.currentIndex, 1);
  });

  await t.test('presence is ephemeral and one receiver can be disconnected independently', async () => {
    clock += 16000;
    await tv2.request('/api/v1/state?role=screen');
    const snapshot = await state(space.id);
    assert.equal(snapshot.screens.find(x => x.id === screen1.id).online, false);
    assert.equal(snapshot.screens.find(x => x.id === screen2.id).online, true);
    screen2 = (await owner.request(`/api/v1/screens/${screen2.id}/route`, { version: screen2.version, input: { kind: 'playlist', id: playlist.id } }, { method: 'PUT' })).body;
    screen1 = (await owner.request(`/api/v1/screens/${screen1.id}/route`, { version: screen1.version, input: null }, { method: 'PUT' })).body;
    assert.equal((await tv1.request('/api/v1/state?role=screen')).body.output, null);
    assert.equal((await tv2.request('/api/v1/state?role=screen')).body.screen.sourceId, playlist.id);
    await tv1.request(`/api/v1/media/${media.id}?role=screen`, undefined, { expected: 403 });
  });

  await t.test('cookies, media, routing and transport survive a service restart', async () => {
    await app.close();
    app = undefined;
    await start();
    assert.equal((await owner.request('/api/v1/me')).body.authenticated, true);
    const snapshot = (await tv2.request('/api/v1/state?role=screen')).body;
    assert.equal(snapshot.screen.id, screen2.id);
    assert.equal(snapshot.source.id, playlist.id);
    assert.equal(snapshot.output.currentIndex, 1);
    assert.equal((await tv2.request(`/api/v1/media/${media.id}?role=screen`)).bytes.compare(PNG), 0);
    await owner.request(`/api/v1/screens/${screen2.id}`, undefined, { method: 'DELETE' });
    await tv2.request('/api/v1/state?role=screen', undefined, { expected: 401 });
    const persisted = await fs.readFile(path.join(dataDir, 'state.json'), 'utf8');
    assert.ok(!persisted.includes(PASSWORD));
    for (const secret of owner.cookies.values()) assert.ok(!persisted.includes(secret));
  });
});

test('the store serializes commits and recovers after a failed atomic write', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-studio-store-'));
  const store = await StudioStore.open({ dataDir, adminPassword: PASSWORD });
  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.change(db => {
      db.spaces[index] = { id: String(index), name: `Space ${index}` };
    })));
    assert.equal(store.db.revision, 12);
    const before = JSON.stringify(store.db);
    const currentFile = path.join(dataDir, 'state.json');
    const savedFile = path.join(dataDir, 'saved.json');
    await fs.rename(currentFile, savedFile);
    await fs.mkdir(currentFile);
    await assert.rejects(store.change(db => { db.spaces.failure = { id: 'failure' }; }));
    assert.equal(JSON.stringify(store.db), before);
    await fs.rmdir(currentFile);
    await fs.rename(savedFile, currentFile);
    await store.change(db => { db.spaces.recovered = { id: 'recovered' }; });
    assert.equal(store.db.revision, 13);
    assert.equal(store.db.spaces.failure, undefined);
    assert.ok((await fs.readFile(currentFile, 'utf8')).includes('recovered'));
    await assert.rejects(store.change(db => { db.spaces.uncloneable = {}; return () => {}; }));
    assert.equal(store.db.revision, 13);
    assert.equal(store.db.spaces.uncloneable, undefined);
  } finally {
    await store.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('timeline includes anchor zero and route versions ignore layout changes', () => {
  assert.equal(playlistPosition({ loop: true, items: [{ durationMs: 10000 }], transport: { playing: true, positionMs: 500, anchorAtMs: 0 } }, 3000), 3500);
  const db = { playlists: { p: { id: 'p', spaceId: 's' } }, screens: {
    a: { id: 'a', spaceId: 's', routeRevision: 1, input: { kind: 'playlist', id: 'p' } },
    b: { id: 'b', spaceId: 's', routeRevision: 1, input: { kind: 'screen', id: 'a' } },
  } };
  const first = resolveScreen(db, 'b');
  db.screens.a.position = { x: 123, y: 400 };
  db.screens.a.version = 40;
  assert.deepEqual(resolveScreen(db, 'b'), first);
  assert.throws(() => validateRoute(db, 'a', { kind: 'screen', id: 'b' }), error => error.status === 409);
  db.screens.a.input = null;
  db.screens.a.routeRevision++;
  assert.equal(resolveScreen(db, 'b').sourceId, null);
  assert.notEqual(resolveScreen(db, 'b').routeVersion, first.routeVersion);
});
