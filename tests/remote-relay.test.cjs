const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createRemoteRelay } = require('../desktop/remote-relay');
const { server } = require('../remote/server');

function listen() { return new Promise(resolve => server.listen(0, () => resolve(server.address().port))); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

test('relay desktop recebe comando do controller e publica estado', async () => {
  const port = await listen();
  try {
    const room = await (await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' })).json();
    const commands = [];
    const relay = createRemoteRelay({
      serverUrl: `http://127.0.0.1:${port}`,
      room: room.room,
      token: room.desktopToken,
      dispatch: command => { commands.push(command); },
      snapshot: () => ({ ready: true, currentId: 'x' }),
      logger: { warn() {} },
    });
    relay.start();
    for (let i = 0; i < 20 && !relay.info().connected; i++) await delay(10);
    assert.equal(relay.info().connected, true);

    const controller = new WebSocket(`ws://127.0.0.1:${port}/ws?role=controller&room=${room.room}&token=${room.controllerToken}`);
    await new Promise((resolve, reject) => { controller.once('open', resolve); controller.once('error', reject); });
    controller.send(JSON.stringify({ id: 7, action: 'blackout' }));
    for (let i = 0; i < 20 && !commands.length; i++) await delay(10);
    assert.deepEqual(commands[0], { id: 7, action: 'blackout' });
    controller.close();
    relay.stop();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
