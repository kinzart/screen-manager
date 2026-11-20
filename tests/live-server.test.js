const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createLiveServer } = require('../desktop/live-server');

test('pareamento, permissões, mídia por intervalos e retorno ao estado atual', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-live-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const commands = [], media = new Map();
  const video = path.join(dir, 'sample.mp4');
  await fs.writeFile(video, '0123456789');
  media.set('a', { path: video });
  let surface = 'logo', received;
  const app = createLiveServer({ secret: 'apenas-para-teste', srcDir: path.resolve('src'), uploadDir: dir,
    media: id => media.get(id), snapshot: role => ({ surface, role }),
    dispatch: async c => { commands.push(c); surface = c.action; app.update(); },
    imported: async (name, label) => { received = { label, bytes: await fs.readFile(name, 'utf8') }; }
  });
  const port = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + port;
  const pair = (role, code, headers = {}) => fetch(base + '/api/pair', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify({ role, code }) });
  const codes = app.info().codes;
  assert.equal((await pair('tv', codes.control)).status, 403);
  assert.equal((await pair('control', codes.control, { Origin: 'https://outro.invalid' })).status, 403);
  const tvResponse = await pair('tv', codes.tv);
  assert.equal(tvResponse.status, 200);
  const tvCookie = tvResponse.headers.get('set-cookie').split(';')[0];
  assert.equal((await pair('tv', codes.tv)).status, 403);
  const phoneResponse = await pair('control', codes.control, { Origin: 'https://evento.example', 'X-Forwarded-Host': 'evento.example' });
  assert.equal(phoneResponse.status, 200);
  assert.match(phoneResponse.headers.get('set-cookie'), /Secure/);
  const phoneCookie = phoneResponse.headers.get('set-cookie').split(';')[0];
  const upload = cookie => fetch(base + '/api/upload?name=painel.jpg', { method: 'POST', headers: { Cookie: cookie }, body: 'imagem de teste' });
  assert.equal((await upload(tvCookie)).status, 403);
  assert.equal((await upload(phoneCookie)).status, 201);
  assert.deepEqual(received, { label: 'painel.jpg', bytes: 'imagem de teste' });
  assert.equal((await fetch(base + '/api/media/a')).status, 403);
  const range = await fetch(base + '/api/media/a', { headers: { Cookie: tvCookie, Range: 'bytes=0-1' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 0-1/10');
  assert.equal(await range.text(), '01');
  assert.equal((await fetch(base + '/api/media/a', { headers: { Cookie: tvCookie, Range: 'bytes=15-' } })).status, 416);
  assert.equal((await fetch(base + '/api/media/fora', { headers: { Cookie: phoneCookie } })).status, 404);
  const connect = async (role, cookie) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/live/' + role, { headers: { Cookie: cookie, Origin: base } });
    const [raw] = await once(ws, 'message'); return { ws, state: JSON.parse(raw).state };
  };
  const phone = await connect('control', phoneCookie);
  const tv = await connect('tv', tvCookie);
  assert.deepEqual(tv.state, { role: 'tv', surface: 'logo' });
  const sent = once(tv.ws, 'message');
  phone.ws.send(JSON.stringify({ id: 1, command: { action: 'blackout' } }));
  assert.equal(JSON.parse((await sent)[0]).state.surface, 'blackout');
  const closed = once(tv.ws, 'close');
  tv.ws.send(JSON.stringify({ id: 2, command: { action: 'next' } }));
  assert.equal((await closed)[0], 1008);
  assert.deepEqual(commands, [{ action: 'blackout' }]);
  const back = await connect('tv', tvCookie);
  assert.equal(back.state.surface, 'blackout');
  phone.ws.close(); back.ws.close();
});
