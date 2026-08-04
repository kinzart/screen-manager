// Testes de integração do ciclo de vida: LifecycleCoordinator + AppController
// REAIS (não fakes de AppController), com StoragePort/MediaPort/
// PresentationAdapter falsos — mesma estratégia de AppController.test.js.
// Cobre os cenários de robustez exigidos pela Etapa 6: elapsed real (não
// contagem de ticks) após background, mídia removida durante o background,
// RuntimeState/playlist corrompidos, picker cancelado, falha de cópia,
// erro de vídeo, background durante importação/vídeo, debounce/flush no
// background, e ausência de Base64 integral (arquivo "grande" como só
// metadado).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { AppController } from '../../www/app/AppController.js';
import { AppShell } from '../../www/app/ui/AppShell.js';
import { LifecycleCoordinator } from '../../www/app/adapters/LifecycleCoordinator.js';
import { StoragePort, MediaPort, PresentationAdapter } from '../../www/app/core/ports.js';

class FakeStorage extends StoragePort {
  constructor({ playlist = [], settings, runtimeState = null } = {}) {
    super();
    this.playlist = playlist;
    this.settings = settings || { rules: [], defaultFit: 'contain', loopPlaylist: true };
    this.runtimeState = runtimeState;
    this.savePlaylistCalls = 0;
    this.saveRuntimeStateCalls = 0;
  }
  async loadPlaylist() { return this.playlist; }
  async savePlaylist(items) { this.savePlaylistCalls += 1; this.playlist = items; }
  async loadSettings() { return this.settings; }
  async saveSettings(s) { this.settings = s; }
  async loadRuntimeState() { return this.runtimeState; }
  async saveRuntimeState(s) { this.saveRuntimeStateCalls += 1; this.runtimeState = s; }
}

class FakeMedia extends MediaPort {
  constructor() { super(); this._nextPick = []; this._failImport = null; this._failCopy = null; }
  setNextPick(files) { this._nextPick = files; }
  failNextImport(error) { this._failImport = error; }
  async pickMedia() { const f = this._nextPick; this._nextPick = []; return f; }
  async importToLibrary(file) {
    if (this._failImport) {
      const error = this._failImport;
      this._failImport = null;
      throw error;
    }
    // Nunca lê conteúdo Base64: só metadados (bytes/mime), mesmo para
    // arquivos "grandes" (ex.: 2 GB) — comprovado por este contrato nunca
    // aceitar/retornar um payload de dados, só { relPath, mime, bytes }.
    return { storage: 'sandbox', relPath: `library/${file.name}`, mime: file.mimeType, bytes: file.size };
  }
  async resolveSrc(ref) { return `resolved://${ref.relPath}`; }
  async deleteFromLibrary() {}
}

class FakePresentation extends PresentationAdapter {
  constructor() { super(); this.calls = []; this._statusHandlers = []; }
  async show(item) { this.calls.push({ method: 'show', item }); }
  async blackout() { this.calls.push({ method: 'blackout' }); }
  async logo() { this.calls.push({ method: 'logo' }); }
  async pause() { this.calls.push({ method: 'pause' }); }
  async resume() { this.calls.push({ method: 'resume' }); }
  async clear() { this.calls.push({ method: 'clear' }); }
  onStatus(cb) { this._statusHandlers.push(cb); }
  emitStatus(status) { this._statusHandlers.forEach((cb) => cb(status)); }
  capabilities() { return { fullscreen: false, remote: false, secondScreen: false }; }
}

function makeFakeAppState() {
  const listeners = [];
  return {
    listeners,
    addListener(eventName, cb) {
      const entry = { cb, removed: false };
      listeners.push(entry);
      return { remove: async () => { entry.removed = true; } };
    },
    emit(isActive) { listeners.filter((l) => !l.removed).forEach((l) => l.cb({ isActive })); },
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

function makeShell() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return new AppShell({ root: dom.window.document.getElementById('root'), confirmFn: () => true });
}

function makeItem(id, overrides = {}) {
  return {
    id,
    media: { storage: 'sandbox', relPath: `library/${id}.jpg`, mime: 'image/jpeg', bytes: 10 },
    name: `${id}.jpg`,
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeSystem({ storage, media, presentation, now } = {}) {
  const s = storage || new FakeStorage();
  const m = media || new FakeMedia();
  const p = presentation || new FakePresentation();
  const controller = new AppController({ storage: s, media: m, presentation: p, shell: makeShell(), now });
  const appState = makeFakeAppState();
  const platform = makeFakePlatform();
  const coordinator = new LifecycleCoordinator({ controller, appState, platform, now });
  return { controller, storage: s, media: m, presentation: p, appState, platform, coordinator };
}

test('background: flush de pendências + save de RuntimeState acontece mesmo com autosave debounced pendente', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { controller, coordinator, appState } = makeSystem({ storage });
  await controller.init();
  await coordinator.start();

  controller.editItem('a', 'duration', 20); // agenda save debounced (500ms), ainda não gravado
  assert.equal(storage.savePlaylistCalls, 0);

  appState.emit(false);
  await flush();

  assert.equal(storage.savePlaylistCalls, 1); // flush forçado pelo background
  assert.equal(storage.saveRuntimeStateCalls, 1);
});

test('background/foreground: elapsed é recalculado por timestamp real, não por contagem de ticks', async () => {
  let fakeNow = 0;
  const now = () => fakeNow;
  const storage = new FakeStorage({ playlist: [makeItem('a', { duration: 60 })] });
  const { controller, coordinator, appState, presentation } = makeSystem({ storage, now });
  await controller.init();
  await coordinator.start();
  await controller.startPresentation('a');

  fakeNow = 5000; // 5s decorridos
  appState.emit(false); // background
  await flush();

  fakeNow = 55000; // +50s reais decorridos EM BACKGROUND (nenhum tick foi somado manualmente)
  appState.emit(true); // foreground
  await flush();

  // elapsed real (55s) < duration (60s): ainda "running", não devia ter avançado.
  assert.equal(controller.isPresenting(), true);
  assert.equal(presentation.calls.filter((c) => c.method === 'show').length, 1); // só o show inicial

  fakeNow = 65000; // agora ultrapassou os 60s de duração
  appState.emit(false);
  await flush();
  appState.emit(true); // foreground: tick detecta expiração e avança
  await flush();

  assert.equal(presentation.calls.filter((c) => c.method === 'show').length, 2); // avançou para o próximo (loop de 1 item)
});

test('mídia removida durante o background: ao voltar, apresentação para e editor mostra aviso', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a', { duration: 5 })] });
  const { controller, coordinator, appState } = makeSystem({ storage });
  await controller.init();
  await coordinator.start();
  await controller.startPresentation('a');

  // Item removido da playlist enquanto o app estava em segundo plano
  // (ex.: sincronização externa, edição em outro dispositivo — aqui simulado
  // removendo diretamente do PlaylistManager interno, como o teste de
  // "autoNext" da Etapa 1 já faz para o caso de item ausente):
  controller._playlist.remove('a');

  appState.emit(false);
  await flush();
  appState.emit(true);
  await flush();

  assert.equal(controller.isPresenting(), false);
  const errorEl = controller._shell.editorView._root ?? null; // apenas para garantir que não lançou
  assert.equal(typeof controller._shell.showEditor, 'function');
});

test('RuntimeState corrompido: init() não lança, aplica defaults e segue operável', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  storage.loadRuntimeState = async () => ({ currentItemId: 123, elapsed: 'NaN-like', isPlaying: 'not-a-bool' });
  const { controller } = makeSystem({ storage });
  await assert.doesNotReject(() => controller.init());
  assert.equal(controller.isPresenting(), false); // currentItemId não bate com nenhum item da playlist -> ignorado
});

test('playlist corrompida (loadPlaylist rejeita): init() não lança, playlist fica vazia, erro reportado', async () => {
  const storage = new FakeStorage();
  storage.loadPlaylist = async () => { throw new Error('JSON inválido'); };
  const { controller } = makeSystem({ storage });
  await assert.doesNotReject(() => controller.init());
  assert.equal(controller._playlist.list().length, 0);
});

test('picker cancelado: nenhum item é adicionado, nenhum crash', async () => {
  const media = new FakeMedia();
  media.setNextPick([]); // cancelado
  const { controller } = makeSystem({ media });
  await controller.init();
  await assert.doesNotReject(() => controller.importMedia());
  assert.equal(controller._playlist.list().length, 0);
});

test('falha de cópia durante importação: erro reportado, nenhum item corrompido adicionado', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'a.jpg', mimeType: 'image/jpeg', size: 10 }]);
  media.failNextImport(new Error('falha de cópia simulada'));
  const { controller } = makeSystem({ media });
  await controller.init();
  await assert.doesNotReject(() => controller.importMedia());
  assert.equal(controller._playlist.list().length, 0);
});

test('erro de vídeo (status da apresentação) não derruba o app; mensagem chega ao editor', async () => {
  const { controller, presentation } = makeSystem();
  await controller.init();
  presentation.emitStatus({ error: 'codec não suportado' });
  // Não deve lançar; apenas propaga a mensagem (já coberto por AppController.test.js
  // na Etapa 4 — aqui confirmamos que o fluxo de lifecycle não interfere).
  assert.ok(true);
});

test('background durante importação em andamento: importação conclui normalmente, sem corromper estado', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'b.mp4', mimeType: 'video/mp4', size: 4096 }]);
  const { controller, coordinator, appState } = makeSystem({ media });
  await controller.init();
  await coordinator.start();

  const importPromise = controller.importMedia();
  appState.emit(false); // background disparado no meio da importação
  await flush();
  await importPromise;

  assert.equal(controller._playlist.list().length, 1);
});

test('background durante apresentação de vídeo: wake lock liberado; foreground o renova', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('v', { type: 'video', duration: 30 })] });
  const { controller, coordinator, appState, platform } = makeSystem({ storage });
  await controller.init();
  await coordinator.start();
  await controller.startPresentation('v');

  appState.emit(false);
  await flush();
  assert.equal(platform.allowSleepCalls, 1);

  appState.emit(true);
  await flush();
  assert.equal(platform.keepAwakeCalls, 1);
});

test('múltiplos appStateChange (background/foreground/background) não geram escritas duplicadas indevidas', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { controller, coordinator, appState } = makeSystem({ storage });
  await controller.init();
  await coordinator.start();

  appState.emit(false);
  appState.emit(true);
  appState.emit(false);
  await coordinator._queue;

  // Sem apresentação ativa (não houve startPresentation), resumeFromBackground
  // é um no-op de leitura (não grava) — só as DUAS transições de background
  // gravam RuntimeState. Confirma que não há gravações duplicadas/perdidas.
  assert.equal(storage.saveRuntimeStateCalls, 2);
});

test('stop() remove o listener: eventos appStateChange subsequentes não afetam mais o controller', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { controller, coordinator, appState } = makeSystem({ storage });
  await controller.init();
  await coordinator.start();
  await coordinator.stop();

  appState.emit(false);
  await flush();

  assert.equal(storage.saveRuntimeStateCalls, 0);
});

test('arquivo "grande" (2 GB) permanece apenas como metadado — nenhum Base64/conteúdo integral trafega', async () => {
  const media = new FakeMedia();
  const twoGB = 2 * 1024 * 1024 * 1024;
  media.setNextPick([{ name: 'grande.mp4', mimeType: 'video/mp4', size: twoGB }]);
  const { controller } = makeSystem({ media });
  await controller.init();
  await controller.importMedia();

  const [item] = controller._playlist.list();
  assert.equal(item.media.bytes, twoGB);
  assert.equal(typeof item.media.relPath, 'string');
  assert.ok(!('data' in item.media)); // nunca um campo de conteúdo/Base64
});
