import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

process.env.REMOTE_REQUIRE_TOKENS = 'true';
process.env.REMOTE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-remote-auth-'));
const { server } = await import('../server.js');

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}

function closes(ws) {
  return new Promise((resolve) => {
    ws.once('error', () => resolve());
    ws.once('close', () => resolve());
  });
}

afterEach(() => new Promise((resolve) => server.close(resolve)));

test('sala em modo seguro gera tokens distintos por papel', async () => {
  const port = await listen();
  const response = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.authRequired, true);
  assert.match(data.displayToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(data.controllerToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(data.displayToken, data.controllerToken);

  const rejected = new WebSocket(`ws://127.0.0.1:${port}/ws?role=display&room=${data.room}`);
  await closes(rejected);

  const display = new WebSocket(`ws://127.0.0.1:${port}/ws?role=display&room=${data.room}&token=${encodeURIComponent(data.displayToken)}`);
  await new Promise((resolve, reject) => { display.once('open', resolve); display.once('error', reject); });
  display.close();
});

test('upload e mídia exigem tokens no modo seguro', async () => {
  const port = await listen();
  const roomResponse = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
  const room = await roomResponse.json();
  const bad = await fetch(`http://127.0.0.1:${port}/api/rooms/${room.room}/media`, {
    method: 'POST', headers: { 'X-Media-Mime': 'image/png' }, body: Buffer.from('png'),
  });
  assert.equal(bad.status, 401);
  const good = await fetch(`http://127.0.0.1:${port}/api/rooms/${room.room}/media`, {
    method: 'POST',
    headers: { 'X-Media-Mime': 'image/png', Authorization: `Bearer ${room.controllerToken}` },
    body: Buffer.from('png'),
  });
  assert.equal(good.status, 200);
  const media = await good.json();
  assert.match(media.url, /token=/);
});
