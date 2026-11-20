const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { DisplayRecovery, OutputState } = require('../desktop/output');

test('perda e retorno preservam o vídeo, a pausa do operador, o blackout e a logo', () => {
  let clock = 0;
  const out = new OutputState(() => clock);
  out.command({ action: 'show', item: { id: 'filme' } });
  clock = 4200;
  out.hold(true);
  clock += 8000;
  assert.equal(out.snapshot().position, 4.2);
  assert.equal(out.snapshot().paused, true);
  out.command({ action: 'pause' }); out.hold(false);
  clock += 1000;
  assert.equal(out.snapshot().position, 4.2);
  assert.equal(out.snapshot().item.id, 'filme');
  out.command({ action: 'resume' }); clock += 1800;
  assert.equal(out.snapshot().position, 6);
  for (const action of ['blackout', 'logo']) {
    out.command({ action }); out.hold(true); out.hold(false);
    assert.equal(out.snapshot().action, action);
    assert.equal(out.snapshot().item, null);
  }
});

const panel = { id: 1, label: 'Operador', primary: true, internal: true };
const television = { id: 2, label: 'TV do evento', internal: false };
const wireless = { kind: 'wireless', deviceName: television.label, devicePath: 'display/venue' };
const saved = { id: '2', label: television.label, internal: false, native: wireless };
function monitor(savedTarget, retryDelays = [60000]) {
  const log = { all: [panel], attached: [], tries: [], hidden: 0 };
  const recovery = new DisplayRecovery({ saved: structuredClone(savedTarget), retryDelays,
    list: () => log.all, identify: async d => d.native || null, remember: target => { log.persisted = target; },
    attach: d => log.attached.push(d.id), hide: () => log.hidden++, notify: () => {},
    reconnect: async (d, signal) => { log.tries.push({ d, signal }); return { message: 'Solicitação enviada' }; }
  });
  return { log, recovery };
}
test('alvo persistido ausente não cai no principal, nem em outra TV com o mesmo nome/ID', async t => {
  const { log, recovery } = monitor(saved); t.after(() => recovery.suspend());
  await recovery.refresh();
  log.all = [panel, { ...television, native: { ...wireless, devicePath: 'display/other' } }];
  await recovery.refresh();
  assert.deepEqual(log.attached, []);
  log.all = [panel, { ...television, id: 9, native: wireless }];
  await recovery.refresh();
  assert.deepEqual(log.attached, [9]); assert.equal(log.persisted.id, '9');
  log.all = [panel]; await recovery.refresh(9);
  assert.equal(recovery.state().blocked, true);
  log.all = [panel, { ...television, native: wireless }, { ...television, id: 8, native: wireless }];
  await recovery.refresh();
  assert.deepEqual(log.attached, [9]);
});
test('tentativas Miracast sucessivas cessam ao trocar a saída; HDMI apenas aguarda', async t => {
  const { recovery, log } = monitor(saved, [2, 4]); t.after(() => recovery.suspend());
  await recovery.refresh();
  for (let i = 0; i < 100 && log.tries.length < 2; i++) await delay(5);
  assert.ok(log.tries.length >= 2);
  assert.ok(log.tries.every(attempt => attempt.d.devicePath === wireless.devicePath));
  recovery.select(panel.id);
  const count = log.tries.length;
  await delay(20);
  assert.equal(log.tries.length, count);
  const wired = monitor({ ...saved, native: { ...wireless, kind: 'wired' } }, [2]);
  t.after(() => wired.recovery.suspend());
  await wired.recovery.refresh(); await delay(15);
  assert.equal(wired.log.tries.length, 0); assert.ok(wired.recovery.state().attempt > 0);
});
test('a seleção manual cancela a conexão nativa em andamento', async t => {
  const { recovery } = monitor(saved, [2]);
  let signal;
  recovery.reconnect = (_identity, cancel) => new Promise(resolve => {
    signal = cancel;
    cancel.addEventListener('abort', () => resolve({ message: 'Cancelada' }), { once: true });
  });
  t.after(() => recovery.suspend());
  await recovery.refresh();
  for (let i = 0; !signal && i < 100; i++) await delay(5);
  assert.ok(signal);
  recovery.select(panel.id); assert.equal(signal.aborted, true);
  await delay(10); assert.equal(recovery.state().targetId, '1');
});
