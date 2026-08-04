// Testes de integração do bootstrap real (mobile/www/app/main.js). Usa
// jsdom para simular o DOM de index.html e fábricas FALSAS (nunca as
// reais @capacitor/*) para nunca tocar a ponte nativa durante os testes —
// a mesma estratégia usada em CapacitorStorage.test.js/CapacitorMedia.test.js/
// AppController.test.js, agora verificando a FIAÇÃO ponta a ponta que só
// main.js faz (chamar as fábricas, montar AppShell/AppController, mostrar
// loading/erro/app).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { bootstrap } from '../../www/app/main.js';
import { createCapacitorStorage } from '../../www/app/adapters/createCapacitorStorage.js';
import { createCapacitorMedia } from '../../www/app/adapters/createCapacitorMedia.js';
import { StoragePort, MediaPort } from '../../www/app/core/ports.js';
import { PresentationPlatform } from '../../www/app/adapters/PresentationPlatform.js';
import { LocalPresentationAdapter } from '../../www/app/adapters/LocalPresentationAdapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = readFileSync(path.resolve(__dirname, '../../www/index.html'), 'utf8');

class FakeStorage extends StoragePort {
  constructor({ delayLoadPlaylist = false } = {}) {
    super();
    this.playlist = [];
    this.settings = { rules: [], defaultFit: 'contain', loopPlaylist: true };
    this._delay = delayLoadPlaylist;
    this._release = null;
  }
  async loadPlaylist() {
    if (this._delay) {
      await new Promise((resolve) => { this._release = resolve; });
    }
    return this.playlist;
  }
  release() { if (this._release) this._release(); }
  async savePlaylist(items) { this.playlist = items; }
  async loadSettings() { return this.settings; }
  async saveSettings(s) { this.settings = s; }
  async loadRuntimeState() { return null; }
  async saveRuntimeState() {}
}

class FakeMedia extends MediaPort {
  constructor() { super(); this._nextPick = []; }
  setNextPick(files) { this._nextPick = files; }
  async pickMedia() { const f = this._nextPick; this._nextPick = []; return f; }
  async importToLibrary(file) {
    return { storage: 'sandbox', relPath: `library/${file.name}`, mime: file.mimeType, bytes: file.size };
  }
  async resolveSrc(ref) { return `resolved://${ref.relPath}`; }
  async deleteFromLibrary() {}
}

function makeDom() {
  const dom = new JSDOM(INDEX_HTML, { url: 'http://localhost/' });
  return dom;
}

function makeBootstrapDeps({ storage, media, dom } = {}) {
  const usedDom = dom || makeDom();
  return {
    doc: usedDom.window.document,
    createStorage: () => storage || new FakeStorage(),
    createMedia: () => media || new FakeMedia(),
    createPlatform: () => new PresentationPlatform({}),
    confirmFn: () => true,
    _dom: usedDom,
  };
}

test('1. bootstrap monta todas as dependências (AppController é construído com sucesso)', async () => {
  const deps = makeBootstrapDeps();
  const controller = await bootstrap(deps);
  assert.ok(controller);
  assert.equal(typeof controller.startPresentation, 'function');
});

test('2. loading aparece durante a inicialização (fica visível até init() resolver)', async () => {
  const storage = new FakeStorage({ delayLoadPlaylist: true });
  const deps = makeBootstrapDeps({ storage });
  const loadingEl = deps.doc.getElementById('boot-loading');
  const appRootEl = deps.doc.getElementById('app-root');

  const pending = bootstrap(deps);
  // ainda carregando: loading visível, app-root escondido
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loadingEl.hidden, false);
  assert.equal(appRootEl.hidden, true);

  storage.release();
  await pending;
  assert.equal(loadingEl.hidden, true);
});

test('3. init bem-sucedida abre o editor (app-root visível, loading/erro escondidos)', async () => {
  const deps = makeBootstrapDeps();
  await bootstrap(deps);
  assert.equal(deps.doc.getElementById('app-root').hidden, false);
  assert.equal(deps.doc.getElementById('boot-loading').hidden, true);
  assert.equal(deps.doc.getElementById('boot-error').hidden, true);
});

test('4. init com erro exibe estado recuperável (erro visível + botão de retry funcional)', async () => {
  const deps = makeBootstrapDeps();
  deps.createStorage = () => {
    throw new Error('falha simulada de inicialização');
  };
  const controller = await bootstrap(deps);
  assert.equal(controller, null);
  const errorEl = deps.doc.getElementById('boot-error');
  assert.equal(errorEl.hidden, false);
  assert.match(deps.doc.getElementById('boot-error-message').textContent, /falha simulada de inicialização/);
  assert.equal(typeof deps.doc.getElementById('boot-retry').onclick, 'function');
});

test('5. as fábricas reais (createCapacitorStorage/createCapacitorMedia) só são chamadas via createPlatformAdapters, nunca no core/UI', () => {
  // main.js delega a escolha nativo/web a createPlatformAdapters.js (ver
  // ETAPA_5C_RUNTIME_RECOVERY_REPORT.md) — só esse arquivo (e
  // createLifecycleCoordinator.js) importa as fábricas Capacitor reais.
  const mainSource = readFileSync(path.resolve(__dirname, '../../www/app/main.js'), 'utf8');
  assert.match(mainSource, /import\s*\{\s*createPlatformAdapters\s*\}\s*from\s*['"]\.\/adapters\/createPlatformAdapters\.js['"]/);
  assert.doesNotMatch(mainSource, /from\s*['"]\.\/adapters\/createCapacitor(Storage|Media)\.js['"]/);

  const platformAdaptersSource = readFileSync(path.resolve(__dirname, '../../www/app/adapters/createPlatformAdapters.js'), 'utf8');
  assert.match(platformAdaptersSource, /import\s*\{\s*createCapacitorStorage\s*\}\s*from\s*['"]\.\/createCapacitorStorage\.js['"]/);
  assert.match(platformAdaptersSource, /import\s*\{\s*createCapacitorMedia\s*\}\s*from\s*['"]\.\/createCapacitorMedia\.js['"]/);
  assert.equal(typeof createCapacitorStorage, 'function');
  assert.equal(typeof createCapacitorMedia, 'function');

  const uiFiles = ['ui/EditorView.js', 'ui/TransportBar.js', 'ui/AppShell.js', 'ui/PresenterView.js', 'AppController.js'];
  for (const file of uiFiles) {
    const source = readFileSync(path.resolve(__dirname, '../../www/app', file), 'utf8');
    assert.doesNotMatch(source, /createCapacitorStorage|createCapacitorMedia/, file);
  }
});

test('6. UI não importa plugins Capacitor diretamente (revalidação end-to-end via bootstrap montado)', async () => {
  const deps = makeBootstrapDeps();
  const controller = await bootstrap(deps);
  // A UI foi construída (AppShell/EditorView/TransportBar/PresenterView)
  // inteiramente a partir de fakes injetados — nenhuma chamada nativa
  // ocorreu (os fakes não implementam nenhuma API de plugin real).
  assert.ok(controller._shell.editorView);
  assert.ok(controller._shell.transportBar);
  assert.ok(controller._shell.presenterView);
});

test('7. AppController recebe todos os adapters esperados (storage, media, presentation, shell)', async () => {
  // O bootstrap sempre monta seu PRÓPRIO LocalPresentationAdapter (passo
  // "construir LocalPresentationAdapter"), então aqui validamos storage/
  // media (as fábricas injetadas) e que a presentation resultante é de
  // fato um LocalPresentationAdapter conectado ao PresenterView do shell —
  // não um objeto arbitrário.
  const storage = new FakeStorage();
  const media = new FakeMedia();
  const deps = makeBootstrapDeps({ storage, media });
  const controller = await bootstrap(deps);
  assert.equal(controller._storage, storage);
  assert.equal(controller._media, media);
  assert.ok(controller._presentation instanceof LocalPresentationAdapter);
  assert.equal(controller._presentation._view, controller._shell.presenterView);
  assert.ok(controller._shell);
});

test('11. modal de exclusão funciona: confirmar remove o item, cancelar mantém', async () => {
  const storage = new FakeStorage();
  storage.playlist = [{
    id: 'a',
    media: { storage: 'sandbox', relPath: 'library/a.jpg', mime: 'image/jpeg', bytes: 10 },
    name: 'a.jpg',
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
  }];
  const dom = makeDom();
  const deps = makeBootstrapDeps({ storage, dom });
  delete deps.confirmFn; // usar o modal real de index.html, não o fake síncrono
  const controller = await bootstrap(deps);

  assert.equal(controller._playlist.length, 1);
  const doc = dom.window.document;
  // O botão de remover só existe dentro do painel expansível do item
  // (Etapa 11 — cards compactos), por isso é preciso abrir o editor do
  // item antes de encontrar ".editor-delete".
  doc.querySelector('.editor-more').dispatchEvent(new doc.defaultView.Event('click'));
  const deleteBtn = doc.querySelector('.editor-delete');
  assert.ok(deleteBtn);

  deleteBtn.dispatchEvent(new doc.defaultView.Event('click'));
  // modal deve estar visível aguardando decisão
  assert.equal(doc.getElementById('confirm-modal').hidden, false);
  doc.getElementById('confirm-modal-cancel').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller._playlist.length, 1); // cancelado: nada removido
  assert.equal(doc.getElementById('confirm-modal').hidden, true);

  // O painel expansível continua aberto (cancelar não o fecha) — o botão
  // de remover ainda está visível, sem precisar reabrir.
  const deleteBtn2 = doc.querySelector('.editor-delete');
  deleteBtn2.dispatchEvent(new doc.defaultView.Event('click'));
  doc.getElementById('confirm-modal-confirm').dispatchEvent(new doc.defaultView.Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller._playlist.length, 0); // confirmado: removido
});

test('17. fluxo completo conectado no bootstrap: importar → playlist → apresentar', async () => {
  const media = new FakeMedia();
  media.setNextPick([{ name: 'clipe.mp4', mimeType: 'video/mp4', size: 4096 }]);
  const deps = makeBootstrapDeps({ media });
  const controller = await bootstrap(deps);

  await controller.importMedia();
  assert.equal(controller._playlist.length, 1);
  const [item] = controller._playlist.list();
  assert.equal(item.type, 'video');

  await controller.startPresentation(item.id);
  assert.equal(controller._shell.isPresenting(), true);
  // A apresentação de fato desenhou o <video> no PresenterView real (via
  // LocalPresentationAdapter montado pelo próprio bootstrap):
  const video = controller._shell.presenterView.mediaSlotEl.querySelector('video');
  assert.ok(video);
  assert.equal(video.src, `resolved://${item.media.relPath}`);
});

test('bootstrap não deixa nenhuma rejeição não tratada quando doc está totalmente ausente', async () => {
  await assert.rejects(() => bootstrap({ doc: undefined }), /documento/);
});
