import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { AppController } from '../www/app/AppController.js';
import { AppShell } from '../www/app/ui/AppShell.js';
import { StoragePort, MediaPort, PresentationAdapter } from '../www/app/core/ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class FakeStorage extends StoragePort {
  constructor({ playlist = [], settings, runtimeState = null } = {}) {
    super();
    this.playlist = playlist;
    this.settings = settings || { rules: [], defaultFit: 'contain', loopPlaylist: true };
    this.runtimeState = runtimeState;
    this.savePlaylistCalls = 0;
    this.saveSettingsCalls = 0;
    this.saveRuntimeStateCalls = 0;
    this._failLoadSettings = null;
    this._failSave = null;
  }
  async loadPlaylist() { return this.playlist; }
  async savePlaylist(items) {
    this.savePlaylistCalls += 1;
    if (this._failSave) throw this._failSave;
    this.playlist = items;
  }
  async loadSettings() {
    if (this._failLoadSettings) throw this._failLoadSettings;
    return this.settings;
  }
  async saveSettings(s) {
    this.saveSettingsCalls += 1;
    if (this._failSave) throw this._failSave;
    this.settings = s;
  }
  async loadRuntimeState() { return this.runtimeState; }
  async saveRuntimeState(s) {
    this.saveRuntimeStateCalls += 1;
    this.runtimeState = s;
  }
}

class FakeMedia extends MediaPort {
  constructor() {
    super();
    this._nextPick = [];
    this._failImportFor = null;
  }
  setNextPick(files) { this._nextPick = files; }
  failNextImport(name, error) { this._failImportFor = { name, error }; }
  async pickMedia() {
    const files = this._nextPick;
    this._nextPick = [];
    return files;
  }
  async importToLibrary(file) {
    if (this._failImportFor && this._failImportFor.name === file.name) {
      const error = this._failImportFor.error;
      this._failImportFor = null;
      throw error;
    }
    return { storage: 'sandbox', relPath: `library/${file.name}`, mime: file.mimeType, bytes: file.size };
  }
  async resolveSrc(ref) { return `resolved://${ref.relPath}`; }
  async deleteFromLibrary() {}
}

class FakePresentation extends PresentationAdapter {
  constructor() {
    super();
    this.calls = [];
    this._statusHandlers = [];
    this._failShow = null;
  }
  async show(item) {
    this.calls.push({ method: 'show', item });
    if (this._failShow) {
      const error = this._failShow;
      this._failShow = null;
      throw error;
    }
  }
  async blackout() { this.calls.push({ method: 'blackout' }); }
  async logo() { this.calls.push({ method: 'logo' }); }
  async pause() { this.calls.push({ method: 'pause' }); }
  async resume() { this.calls.push({ method: 'resume' }); }
  async clear() { this.calls.push({ method: 'clear' }); }
  onStatus(cb) { this._statusHandlers.push(cb); }
  emitStatus(status) { this._statusHandlers.forEach((cb) => cb(status)); }
  capabilities() { return { fullscreen: false, remote: false, secondScreen: false }; }
}

function makeManualScheduler() {
  let pending = null;
  return {
    schedule: (fn) => { pending = fn; return 'timer-handle'; },
    cancel: () => { pending = null; },
    flush() {
      const fn = pending;
      pending = null;
      if (fn) fn();
    },
    hasPending: () => !!pending,
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

function makeApp({ storage, media, presentation, shell, now } = {}) {
  const scheduler = makeManualScheduler();
  const app = new AppController({
    storage: storage || new FakeStorage(),
    media: media || new FakeMedia(),
    presentation: presentation || new FakePresentation(),
    shell: shell || makeShell(),
    scheduleDebounce: scheduler.schedule,
    cancelDebounce: scheduler.cancel,
    now,
  });
  return { app, scheduler };
}

// ---------------------------------------------------------------------

test('1. inicialização vazia: sem playlist/settings salvos, editor renderiza vazio', async () => {
  const { app } = makeApp();
  await app.init();
  assert.equal(app._shell.editorView.emptyStateEl.hidden, false);
});

test('2. restauração de playlist: itens salvos aparecem após init()', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const { app } = makeApp({ storage });
  await app.init();
  assert.equal(app._shell.editorView.listEl.children.length, 2);
});

test('3. restauração de settings: loopPlaylist salvo é refletido no botão de loop', async () => {
  const storage = new FakeStorage({ settings: { rules: [], defaultFit: 'contain', loopPlaylist: false } });
  const { app } = makeApp({ storage });
  await app.init();
  assert.equal(app._shell.editorView.loopButtonEl.getAttribute('aria-pressed'), 'false');
});

test('4. restauração de RuntimeState: item/elapsed corrente é restaurado no PlaybackEngine', async () => {
  const storage = new FakeStorage({
    playlist: [makeItem('a', { duration: 30 })],
    runtimeState: { currentItemId: 'a', elapsed: 12, isPlaying: true, locked: false, blackout: false, presenting: true },
  });
  const { app } = makeApp({ storage, now: () => 1_000_000 });
  await app.init();
  assert.equal(app._playback.currentId, 'a');
  assert.equal(app._playback.elapsed(), 12);
});

test('5. importação cancelada: pickMedia() retorna [] e nada é adicionado', async () => {
  const media = new FakeMedia();
  media.setNextPick([]);
  const { app } = makeApp({ media });
  await app.init();
  await app.importMedia();
  assert.equal(app._playlist.length, 0);
  assert.equal(app._shell.editorView.feedbackEl.textContent, 'Importação cancelada');
});

test('6. importação concluída: arquivo selecionado vira item na playlist e agenda salvamento', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'foto.jpg', mimeType: 'image/jpeg', size: 100 }]);
  const storage = new FakeStorage();
  const { app, scheduler } = makeApp({ media, storage });
  await app.init();
  await app.importMedia();
  assert.equal(app._playlist.length, 1);
  assert.equal(app._playlist.list()[0].name, 'foto.jpg');
  assert.equal(scheduler.hasPending(), true);
});

test('7. adicionar à playlist: via importação, item aparece renderizado no editor', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'a.jpg', mimeType: 'image/jpeg', size: 10 }]);
  const { app } = makeApp({ media });
  await app.init();
  await app.importMedia();
  assert.equal(app._shell.editorView.listEl.children.length, 1);
});

test('8. remover item: some da playlist e do editor', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.removeFromPlaylist('a');
  assert.equal(app._playlist.length, 0);
  assert.equal(app._shell.editorView.listEl.children.length, 0);
});

test('9. mover para cima: troca de posição com o vizinho anterior', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.moveItem('b', -1);
  assert.deepEqual(app._playlist.list().map((i) => i.id), ['b', 'a']);
});

test('10. mover para baixo: troca de posição com o vizinho seguinte', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.moveItem('a', 1);
  assert.deepEqual(app._playlist.list().map((i) => i.id), ['b', 'a']);
});

test('11. editar duração: PlaylistManager reflete o novo valor', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a', { duration: 10 })] });
  const { app } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'duration', 25);
  assert.equal(app._playlist.findById('a').duration, 25);
});

test('12. editar transição: PlaylistManager reflete o novo valor', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'transition', 'zoom');
  assert.equal(app._playlist.findById('a').transition, 'zoom');
});

test('13. editar fit: PlaylistManager reflete o novo valor', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'fit', 'cover');
  assert.equal(app._playlist.findById('a').fit, 'cover');
});

test('14. editar startAt: PlaylistManager reflete o novo valor', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'startAt', '19:00:00');
  assert.equal(app._playlist.findById('a').startAt, '19:00:00');
});

test('15. ativar/desativar loop: alterna settings.loopPlaylist', async () => {
  const storage = new FakeStorage({ settings: { rules: [], defaultFit: 'contain', loopPlaylist: true } });
  const { app } = makeApp({ storage });
  await app.init();
  app.toggleLoop();
  assert.equal(app._settings.loopPlaylist, false);
  app.toggleLoop();
  assert.equal(app._settings.loopPlaylist, true);
});

test('16. iniciar apresentação: mostra a PresenterView e chama PresentationAdapter.show', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  assert.equal(app._shell.isPresenting(), true);
  assert.equal(presentation.calls[0].method, 'show');
  assert.equal(app._playback.currentId, 'a');
});

test('17. pause: togglePlayback() em execução chama PresentationAdapter.pause', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.togglePlayback();
  assert.ok(presentation.calls.some((c) => c.method === 'pause'));
});

test('18. resume: togglePlayback() pausado chama PresentationAdapter.resume', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.togglePlayback(); // pause
  await app.togglePlayback(); // resume
  assert.ok(presentation.calls.some((c) => c.method === 'resume'));
});

test('19. next: avança para o próximo item e chama PresentationAdapter.show novamente', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.next();
  assert.equal(app._playback.currentId, 'b');
});

test('20. previous: volta para o item anterior', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const { app } = makeApp({ storage });
  await app.init();
  await app.startPresentation('b');
  await app.previous();
  assert.equal(app._playback.currentId, 'a');
});

test('21. blackout: chama PresentationAdapter.blackout e marca playback.blackout', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.blackout();
  assert.ok(presentation.calls.some((c) => c.method === 'blackout'));
  assert.equal(app._playback.blackout, true);
});

test('22. logo: chama PresentationAdapter.logo', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.logo();
  assert.ok(presentation.calls.some((c) => c.method === 'logo'));
});

test('23. sair da apresentação: volta ao editor e limpa a apresentação', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const presentation = new FakePresentation();
  const { app } = makeApp({ storage, presentation });
  await app.init();
  await app.startPresentation('a');
  await app.exitPresentation();
  assert.equal(app._shell.isPresenting(), false);
  assert.ok(presentation.calls.some((c) => c.method === 'clear'));
});

test('23b. sair da apresentação via botão de saída da PresenterView', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  await app.startPresentation('a');
  app._shell.presenterView.exitButtonEl.dispatchEvent(new app._shell.presenterView._doc.defaultView.Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(app._shell.isPresenting(), false);
});

test('24. erro de mídia: status de erro emitido pelo PresentationAdapter aparece no editor', async () => {
  const presentation = new FakePresentation();
  const { app } = makeApp({ presentation });
  await app.init();
  presentation.emitStatus({ error: 'Não foi possível reproduzir o vídeo.' });
  assert.equal(app._shell.editorView.errorEl.hidden, false);
  assert.equal(app._shell.editorView.errorEl.textContent, 'Não foi possível reproduzir o vídeo.');
});

test('25. erro de persistência: falha ao salvar aparece ao usuário sem destruir o estado em memória', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  storage._failSave = new Error('disco cheio');
  const { app, scheduler } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'duration', 20);
  scheduler.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(app._shell.editorView.errorEl.hidden, false);
  // estado em memória não foi destruído:
  assert.equal(app._playlist.findById('a').duration, 20);
});

test('26. autosave sem excesso de escritas: várias edições seguidas geram uma única escrita (debounce)', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app, scheduler } = makeApp({ storage });
  await app.init();
  app.editItem('a', 'duration', 11);
  app.editItem('a', 'duration', 12);
  app.editItem('a', 'duration', 13);
  assert.equal(storage.savePlaylistCalls, 0); // nada foi escrito ainda, só agendado
  scheduler.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.savePlaylistCalls, 1); // uma única escrita para as 3 edições
});

test('30. fluxo completo: importar → adicionar à playlist → apresentar', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'clipe.mp4', mimeType: 'video/mp4', size: 5000 }]);
  const presentation = new FakePresentation();
  const { app, scheduler } = makeApp({ media, presentation });
  await app.init();
  await app.importMedia();
  const [item] = app._playlist.list();
  assert.equal(item.type, 'video');
  await app.startPresentation(item.id);
  assert.equal(app._shell.isPresenting(), true);
  assert.equal(presentation.calls[0].method, 'show');
  assert.equal(presentation.calls[0].item.id, item.id);
  scheduler.flush();
});

// ---------------------------------------------------------------------
// ARQUITETURA
// ---------------------------------------------------------------------

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('27. UI sem dependência direta de Capacitor: nenhum arquivo de mobile/www/app/ui/** importa @capacitor/*', () => {
  const uiFiles = ['EditorView.js', 'TransportBar.js', 'AppShell.js', 'PresenterView.js'];
  for (const file of uiFiles) {
    const source = stripComments(readFileSync(path.resolve(__dirname, '../www/app/ui', file), 'utf8'));
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//, file);
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capawesome\//, file);
  }
  const controllerSource = stripComments(readFileSync(path.resolve(__dirname, '../www/app/AppController.js'), 'utf8'));
  assert.doesNotMatch(controllerSource, /(?:from\s+['"]|require\(\s*['"])@capacitor\//);
});

test('28. UI sem Electron: nenhum arquivo de mobile/www/app/** importa electron', () => {
  const files = ['ui/EditorView.js', 'ui/TransportBar.js', 'ui/AppShell.js', 'ui/PresenterView.js', 'AppController.js'];
  for (const file of files) {
    const source = stripComments(readFileSync(path.resolve(__dirname, '../www/app', file), 'utf8'));
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/, file);
  }
});

test('29. controles possuem aria-label: verificado de ponta a ponta via AppShell montado', async () => {
  const storage = new FakeStorage({ playlist: [makeItem('a')] });
  const { app } = makeApp({ storage });
  await app.init();
  assert.ok(app._shell.editorView.importButtonEl.getAttribute('aria-label'));
  assert.ok(app._shell.presenterView.exitButtonEl.getAttribute('aria-label'));
  for (const el of [app._shell.transportBar.previousButtonEl, app._shell.transportBar.playPauseButtonEl, app._shell.transportBar.nextButtonEl, app._shell.transportBar.blackoutButtonEl, app._shell.transportBar.logoButtonEl]) {
    assert.ok(el.getAttribute('aria-label'));
  }
});

test('31. startPresentation(): currentId "fantasma" (item apresentado e depois removido) não trava a apresentação — cai para o primeiro item real', async () => {
  // Bug real reproduzido em device: PlaybackEngine.stop() nunca limpa
  // currentId (intencional — permite retomar o mesmo item depois). Se o
  // item apontado por currentId for removido da playlist enquanto estava
  // no ar, um startPresentation() sem id explícito (como o botão
  // "Apresentar" de Início/Apresentação-parado) tentava usar esse id
  // obsoleto; PlaybackEngine.take() lançava ANTES de showPresenter() ser
  // chamado — a tela simplesmente não mudava, sem nenhum erro visível.
  const storage = new FakeStorage({ playlist: [makeItem('a'), makeItem('b')] });
  const { app } = makeApp({ storage });
  await app.init();

  await app.startPresentation('a'); // currentId = 'a'
  app.removeFromPlaylist('a'); // wasCurrent → stop() é chamado, mas currentId continua 'a'
  assert.equal(app._playback.currentId, 'a', 'precondição: currentId realmente fica "fantasma" após remover o item no ar');

  await assert.doesNotReject(() => app.startPresentation());
  assert.equal(app._shell.isPresenting(), true, 'a apresentação deveria ter iniciado normalmente com o próximo item real');
  assert.equal(app._playback.currentId, 'b');
});

test('32. connectRemote()/disconnectRemote(): troca para RemoteDesktopAdapter e volta ao LocalPresentationAdapter original', async () => {
  // WebSocket/fetch globais são substituídos por fakes só para este teste
  // (RemoteDesktopAdapter usa os globais por padrão, já que AppController
  // não os injeta) — nunca toca rede real.
  class FakeGlobalWebSocket {
    constructor(url) { this.url = url; this.listeners = {}; queueMicrotask(() => this._emit('open')); }
    addEventListener(e, cb) { (this.listeners[e] ||= []).push(cb); }
    send() {}
    close() { this._emit('close'); }
    _emit(e, p) { (this.listeners[e] || []).forEach((cb) => cb(p || {})); }
  }
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  globalThis.WebSocket = FakeGlobalWebSocket;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ mediaId: 'x', url: '/media/1234/x' }) });

  try {
    const storage = new FakeStorage();
    const { app } = makeApp({ storage });
    await app.init();
    const localPresentation = app._presentation;

    await app.connectRemote('https://relay.exemplo.com', '1234');
    assert.equal(app.isRemoteConnected(), true);
    assert.notEqual(app._presentation, localPresentation);
    assert.equal(app._settings.remote.enabled, true);
    assert.equal(app._settings.remote.serverUrl, 'https://relay.exemplo.com');
    assert.equal(app._settings.remote.room, '1234');
    assert.equal(storage.settings.remote.enabled, true, 'deveria persistir a configuração remota');

    await app.disconnectRemote();
    assert.equal(app.isRemoteConnected(), false);
    assert.equal(app._presentation, localPresentation);
    assert.equal(app._settings.remote.enabled, false);
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
  }
});

test('AppController não cria dependência circular: shell/views nunca recebem o storage/media/presentation diretamente', () => {
  const controllerSource = stripComments(readFileSync(path.resolve(__dirname, '../www/app/AppController.js'), 'utf8'));
  // A UI (AppShell/EditorView/TransportBar/PresenterView) nunca é
  // construída passando storage/media/presentation adiante — só o
  // AppController os recebe e os intermedia via callbacks.
  assert.doesNotMatch(controllerSource, /new\s+(EditorView|TransportBar|PresenterView|AppShell)\(/);
});
