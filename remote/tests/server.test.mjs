// Testes reais de ponta a ponta do servidor de retransmissão: cria sala,
// conecta display + controller via WebSocket de verdade, envia comando,
// confirma que chega no display; faz upload real de um arquivo e confirma
// que a URL devolvida serve os bytes corretos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.REMOTE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-remote-test-'));
const { server } = await import('../server.js');

function listen() {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
}

function wait(ws, event) {
  return new Promise((resolve) => ws.once(event, resolve));
}

/**
 * Fila de mensagens que começa a capturar a partir do momento em que é
 * criada (antes de "open"), para nunca perder uma mensagem enviada pelo
 * servidor logo após o handshake (race real: o servidor pode mandar
 * {type:'connected'} antes do cliente disparar 'open' localmente).
 */
function messageQueue(ws) {
  const pending = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else pending.push(msg);
  });
  return {
    next: () => (pending.length ? Promise.resolve(pending.shift()) : new Promise((resolve) => waiters.push(resolve))),
  };
}

test('POST /api/rooms cria uma sala com código de 4 dígitos', async () => {
  const port = await listen();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.room, /^\d{4}$/);
  } finally {
    server.close();
  }
});

test('display conecta, controller conecta na mesma sala, comando chega ao display', async () => {
  const port = await listen();
  try {
    const roomRes = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
    const { room } = await roomRes.json();

    const displayWs = new WebSocket(`ws://127.0.0.1:${port}/ws?role=display&room=${room}`);
    const displayMessages = messageQueue(displayWs);
    await wait(displayWs, 'open');

    const controllerWs = new WebSocket(`ws://127.0.0.1:${port}/ws?role=controller&room=${room}`);
    const controllerMessages = messageQueue(controllerWs);
    await wait(controllerWs, 'open');
    const connectedMsg = await controllerMessages.next();
    assert.equal(connectedMsg.type, 'connected');
    assert.equal(connectedMsg.room, room);

    // O display recebe {type:'controller-connected'} assim que o
    // controller entra na sala — consumido antes do comando de teste.
    const controllerConnectedNotice = await displayMessages.next();
    assert.equal(controllerConnectedNotice.type, 'controller-connected');

    controllerWs.send(JSON.stringify({ action: 'blackout' }));
    const received = await displayMessages.next();
    assert.equal(received.action, 'blackout');

    displayWs.close();
    controllerWs.close();
  } finally {
    server.close();
  }
});

test('controller não consegue conectar em sala inexistente', async () => {
  const port = await listen();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=controller&room=0000`);
    await new Promise((resolve) => {
      ws.once('error', resolve);
      ws.once('close', resolve);
    });
    assert.notEqual(ws.readyState, WebSocket.OPEN);
  } finally {
    server.close();
  }
});

test('upload de mídia real: salva o arquivo e a URL devolvida serve os bytes corretos', async () => {
  const port = await listen();
  try {
    const roomRes = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
    const { room } = await roomRes.json();

    const fixture = fs.readFileSync(path.resolve(__dirname, '../../mobile/tests/fixtures/sample-image.png'));
    const uploadRes = await fetch(`http://127.0.0.1:${port}/api/rooms/${room}/media`, {
      method: 'POST',
      headers: { 'X-Media-Mime': 'image/png', 'Content-Type': 'application/octet-stream' },
      body: fixture,
    });
    assert.equal(uploadRes.status, 200);
    const { mediaId, url } = await uploadRes.json();
    assert.ok(mediaId);
    assert.equal(url, `/media/${room}/${mediaId}`);

    const mediaRes = await fetch(`http://127.0.0.1:${port}${url}`);
    assert.equal(mediaRes.status, 200);
    assert.equal(mediaRes.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await mediaRes.arrayBuffer());
    assert.deepEqual(bytes, fixture);
  } finally {
    server.close();
  }
});

test('upload rejeita mime não suportado', async () => {
  const port = await listen();
  try {
    const roomRes = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
    const { room } = await roomRes.json();
    const uploadRes = await fetch(`http://127.0.0.1:${port}/api/rooms/${room}/media`, {
      method: 'POST',
      headers: { 'X-Media-Mime': 'application/pdf' },
      body: Buffer.from('not media'),
    });
    assert.equal(uploadRes.status, 400);
  } finally {
    server.close();
  }
});

test('status enviado pelo display é retransmitido para os controllers da sala', async () => {
  const port = await listen();
  try {
    const roomRes = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
    const { room } = await roomRes.json();

    const displayWs = new WebSocket(`ws://127.0.0.1:${port}/ws?role=display&room=${room}`);
    await wait(displayWs, 'open');
    const controllerWs = new WebSocket(`ws://127.0.0.1:${port}/ws?role=controller&room=${room}`);
    const controllerMessages = messageQueue(controllerWs);
    await wait(controllerWs, 'open');
    await controllerMessages.next(); // consome o {type:'connected'} inicial

    displayWs.send(JSON.stringify({ type: 'status', error: 'Não foi possível carregar "x.png".' }));
    const received = await controllerMessages.next();
    assert.equal(received.type, 'status');
    assert.match(received.error, /x\.png/);

    displayWs.close();
    controllerWs.close();
  } finally {
    server.close();
  }
});
