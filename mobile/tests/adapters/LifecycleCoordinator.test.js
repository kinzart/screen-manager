// Testes puros do LifecycleCoordinator: fakes de AppController, appState
// (nunca @capacitor/app real) e PresentationPlatform. Cobre: registro/
// remoção de listener, flush+save ao ir para background, liberação/
// renovação de wake lock condicionada a isPresenting(), serialização de
// múltiplos eventos appStateChange, e resiliência a erros do controller.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LifecycleCoordinator } from '../../www/app/adapters/LifecycleCoordinator.js';

function makeFakeAppState() {
  const listeners = [];
  return {
    listeners,
    addListener(eventName, cb) {
      const entry = { eventName, cb, removed: false };
      listeners.push(entry);
      return { remove: async () => { entry.removed = true; } };
    },
    emit(isActive) {
      listeners.filter((l) => !l.removed).forEach((l) => l.cb({ isActive }));
    },
  };
}

function makeFakeController({ presenting = true } = {}) {
  return {
    _presenting: presenting,
    flushCalls: 0,
    saveCalls: 0,
    resumeCalls: [],
    failFlush: null,
    failSave: null,
    failResume: null,
    isPresenting() { return this._presenting; },
    async flushPendingSave() {
      this.flushCalls += 1;
      if (this.failFlush) throw this.failFlush;
    },
    async saveRuntimeStateNow() {
      this.saveCalls += 1;
      if (this.failSave) throw this.failSave;
    },
    async resumeFromBackground(now) {
      this.resumeCalls.push(now);
      if (this.failResume) throw this.failResume;
      return { action: 'idle' };
    },
  };
}

function makeFakePlatform() {
  return {
    allowSleepCalls: 0,
    keepAwakeCalls: 0,
    async allowSleep() { this.allowSleepCalls += 1; },
    async keepAwake() { this.keepAwakeCalls += 1; },
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('construtor exige "controller" e "appState" válidos', () => {
  assert.throws(() => new LifecycleCoordinator({ appState: makeFakeAppState() }), /controller/);
  assert.throws(() => new LifecycleCoordinator({ controller: makeFakeController() }), /appState/);
});

test('start() registra o listener appStateChange; stop() remove; ambos idempotentes', async () => {
  const appState = makeFakeAppState();
  const coordinator = new LifecycleCoordinator({ controller: makeFakeController(), appState });

  assert.equal(coordinator.isStarted, false);
  await coordinator.start();
  assert.equal(coordinator.isStarted, true);
  assert.equal(appState.listeners.length, 1);
  assert.equal(appState.listeners[0].removed, false);

  await coordinator.start(); // idempotente: não duplica
  assert.equal(appState.listeners.length, 1);

  await coordinator.stop();
  assert.equal(coordinator.isStarted, false);
  assert.equal(appState.listeners[0].removed, true);

  await coordinator.stop(); // idempotente: não lança
});

test('background: chama flushPendingSave e saveRuntimeStateNow no controller', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController();
  const coordinator = new LifecycleCoordinator({ controller, appState });
  await coordinator.start();

  appState.emit(false);
  await flush();

  assert.equal(controller.flushCalls, 1);
  assert.equal(controller.saveCalls, 1);
});

test('background: libera wake lock quando isPresenting() é true e platform foi injetada', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController({ presenting: true });
  const platform = makeFakePlatform();
  const coordinator = new LifecycleCoordinator({ controller, appState, platform });
  await coordinator.start();

  appState.emit(false);
  await flush();

  assert.equal(platform.allowSleepCalls, 1);
  assert.equal(platform.keepAwakeCalls, 0);
});

test('background: NÃO libera wake lock quando não está apresentando', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController({ presenting: false });
  const platform = makeFakePlatform();
  const coordinator = new LifecycleCoordinator({ controller, appState, platform });
  await coordinator.start();

  appState.emit(false);
  await flush();

  assert.equal(platform.allowSleepCalls, 0);
});

test('foreground: chama resumeFromBackground(now) e renova wake lock apenas se apresentando', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController({ presenting: true });
  const platform = makeFakePlatform();
  let fakeNow = 1000;
  const coordinator = new LifecycleCoordinator({ controller, appState, platform, now: () => fakeNow });
  await coordinator.start();

  appState.emit(true);
  await flush();

  assert.deepEqual(controller.resumeCalls, [1000]);
  assert.equal(platform.keepAwakeCalls, 1);
  assert.equal(platform.allowSleepCalls, 0);
});

test('múltiplos eventos appStateChange em sequência rápida são processados em ordem, sem sobreposição', async () => {
  const appState = makeFakeAppState();
  const order = [];
  const controller = makeFakeController();
  const originalFlush = controller.flushPendingSave.bind(controller);
  controller.flushPendingSave = async () => {
    order.push('background-start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await originalFlush();
    order.push('background-end');
  };
  const originalResume = controller.resumeFromBackground.bind(controller);
  controller.resumeFromBackground = async (now) => {
    order.push('foreground-start');
    const result = await originalResume(now);
    order.push('foreground-end');
    return result;
  };
  const coordinator = new LifecycleCoordinator({ controller, appState });
  await coordinator.start();

  // background, foreground, background disparados sem aguardar entre si:
  appState.emit(false);
  appState.emit(true);
  appState.emit(false);
  await coordinator._queue;

  assert.deepEqual(order, [
    'background-start', 'background-end',
    'foreground-start', 'foreground-end',
    'background-start', 'background-end',
  ]);
});

test('reentrada rápida no foreground (dois eventos isActive:true seguidos) não duplica efeitos indevidamente', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController();
  const coordinator = new LifecycleCoordinator({ controller, appState });
  await coordinator.start();

  appState.emit(true);
  appState.emit(true);
  await flush();
  await flush();

  assert.equal(controller.resumeCalls.length, 2); // ambos processados, em ordem, sem crash
});

test('erro no flushPendingSave durante background é registrado via logger, sem lançar', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController();
  controller.failFlush = new Error('falha simulada de flush');
  const warnings = [];
  const coordinator = new LifecycleCoordinator({
    controller, appState, logger: { warn: (p) => warnings.push(p) },
  });
  await coordinator.start();

  appState.emit(false);
  await flush();

  assert.equal(controller.saveCalls, 1); // continua tentando salvar o runtime state mesmo com flush falho
  assert.ok(warnings.some((w) => w.event === 'lifecycle.flush-failed'));
});

test('erro no resumeFromBackground é registrado via logger, sem lançar e sem travar próximos eventos', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController();
  controller.failResume = new Error('falha simulada de resume');
  const warnings = [];
  const coordinator = new LifecycleCoordinator({
    controller, appState, logger: { warn: (p) => warnings.push(p) },
  });
  await coordinator.start();

  appState.emit(true);
  await flush();
  assert.ok(warnings.some((w) => w.event === 'lifecycle.resume-failed'));

  controller.failResume = null;
  appState.emit(true);
  await flush();
  assert.equal(controller.resumeCalls.length, 2); // segundo evento processado normalmente
});

test('sem platform injetada: background/foreground funcionam normalmente, sem tentar wake lock', async () => {
  const appState = makeFakeAppState();
  const controller = makeFakeController({ presenting: true });
  const coordinator = new LifecycleCoordinator({ controller, appState }); // sem platform
  await coordinator.start();

  appState.emit(false);
  await flush();
  appState.emit(true);
  await flush();

  assert.equal(controller.flushCalls, 1);
  assert.equal(controller.resumeCalls.length, 1);
});
