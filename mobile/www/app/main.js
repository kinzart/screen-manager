// Bootstrap real do aplicativo mobile. Delega a createPlatformAdapters.js
// (único outro arquivo autorizado, além de createLifecycleCoordinator.js, a
// importar Capacitor) a escolha entre as fábricas nativas
// (createCapacitorStorage/createCapacitorMedia) e o adapter web
// (WebMediaAdapter) — nenhum módulo de UI/AppController importa Capacitor
// diretamente. Nunca importa Electron.
//
// Testável: exporta bootstrap({...}) aceitando todas as dependências por
// injeção (doc, factories, confirmFn) com defaults reais; só roda
// automaticamente quando `document` existe (browser/WebView), nunca ao ser
// importado por um teste Node/jsdom que não fornece `document` global.

import { createPlatformAdapters } from './adapters/createPlatformAdapters.js';
import { PresentationPlatform } from './adapters/PresentationPlatform.js';
import { LocalPresentationAdapter } from './adapters/LocalPresentationAdapter.js';
import { AppShell } from './ui/AppShell.js';
import { AppController } from './AppController.js';
import { PlaylistManager } from './core/PlaylistManager.js';
import { PlaybackEngine } from './core/PlaybackEngine.js';
import { ScheduleEngine } from './core/ScheduleEngine.js';
import { createLifecycleCoordinator } from './adapters/createLifecycleCoordinator.js';

/** Cria o confirmFn assíncrono ligado ao modal real de index.html; cai para window.confirm se o modal não existir no DOM. */
function createModalConfirm(doc) {
  const modal = doc.getElementById('confirm-modal');
  const titleEl = doc.getElementById('confirm-modal-title');
  const cancelBtn = doc.getElementById('confirm-modal-cancel');
  const confirmBtn = doc.getElementById('confirm-modal-confirm');
  if (!modal || !titleEl || !cancelBtn || !confirmBtn) {
    return (message) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(message) : true);
  }
  return (message) => new Promise((resolve) => {
    titleEl.textContent = message;
    modal.hidden = false;
    const cleanup = (result) => {
      modal.hidden = true;
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
  });
}

function createRealPlatform(doc) {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const scr = typeof screen !== 'undefined' ? screen : undefined;
  const root = doc?.documentElement;
  return new PresentationPlatform({
    wakeLock: nav?.wakeLock,
    orientation: scr?.orientation,
    fullscreen: root && typeof root.requestFullscreen === 'function'
      ? { request: (el) => (el || root).requestFullscreen(), exit: () => doc.exitFullscreen() }
      : undefined,
  });
}

/**
 * @param {object} [options]
 * @param {Document} [options.doc] - default: `document` global (browser/WebView).
 * @param {(deps: {doc: Document}) => import('./core/ports.js').StoragePort} [options.createStorage] - default: escolhido por createPlatformAdapters (nativo vs. web).
 * @param {(deps: {doc: Document}) => import('./core/ports.js').MediaPort} [options.createMedia] - default: escolhido por createPlatformAdapters (nativo vs. web).
 * @param {(doc: Document) => PresentationPlatform} [options.createPlatform]
 * @param {(message:string) => boolean|Promise<boolean>} [options.confirmFn]
 * @param {(deps: {controller: AppController, platform: PresentationPlatform}) => import('./adapters/LifecycleCoordinator.js').LifecycleCoordinator} [options.createLifecycle]
 * @returns {Promise<AppController|null>} null quando a inicialização falha (erro já exibido na UI).
 */
export async function bootstrap({
  doc = typeof document !== 'undefined' ? document : undefined,
  createStorage = ({ doc: d } = {}) => createPlatformAdapters({ doc: d }).storage,
  createMedia = ({ doc: d } = {}) => createPlatformAdapters({ doc: d }).media,
  createPlatform,
  confirmFn,
  createLifecycle = createLifecycleCoordinator,
} = {}) {
  if (!doc) throw new Error('bootstrap: documento (DOM) indisponível neste ambiente');

  const loadingEl = doc.getElementById('boot-loading');
  const errorEl = doc.getElementById('boot-error');
  const errorMessageEl = doc.getElementById('boot-error-message');
  const retryButtonEl = doc.getElementById('boot-retry');
  const appRootEl = doc.getElementById('app-root');
  if (!appRootEl) throw new Error('bootstrap: elemento #app-root não encontrado em index.html');

  const showLoading = () => {
    if (loadingEl) loadingEl.hidden = false;
    if (errorEl) errorEl.hidden = true;
    appRootEl.hidden = true;
  };
  const showError = (message) => {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      if (errorMessageEl) errorMessageEl.textContent = message;
    }
    appRootEl.hidden = true;
  };
  const showApp = () => {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    appRootEl.hidden = false;
  };

  showLoading();

  const resolvedConfirmFn = confirmFn || createModalConfirm(doc);
  const resolvedCreatePlatform = createPlatform || (() => createRealPlatform(doc));

  let controller = null;
  try {
    const storage = createStorage({ doc });
    const media = createMedia({ doc });
    const shell = new AppShell({ root: appRootEl, logoSrc: '', confirmFn: resolvedConfirmFn });
    const platform = resolvedCreatePlatform(doc);
    const presentation = new LocalPresentationAdapter({
      view: shell.presenterView,
      platform,
      resolveSrc: (mediaRef) => media.resolveSrc(mediaRef),
    });

    controller = new AppController({
      storage,
      media,
      presentation,
      shell,
      confirmFn: resolvedConfirmFn,
      playlistManager: new PlaylistManager(),
      playbackEngine: new PlaybackEngine(),
      scheduleEngine: new ScheduleEngine([]),
    });

    await controller.init();

    try {
      const lifecycle = createLifecycle({ controller, platform });
      await lifecycle.start();
    } catch (error) {
      // Ausência do plugin @capacitor/app (ex.: navegador puro, sem WebView
      // nativa) não deve impedir o app de abrir — apenas o ciclo de vida
      // background/foreground fica sem observação automática.
      console.warn('[main] LifecycleCoordinator não pôde ser iniciado', error);
    }

    showApp();
  } catch (error) {
    const message = `Não foi possível iniciar o aplicativo: ${String(error?.message || error)}`;
    showError(message);
    if (retryButtonEl) {
      retryButtonEl.onclick = () => {
        bootstrap({ doc, createStorage, createMedia, createPlatform, confirmFn, createLifecycle }).catch((retryError) => {
          showError(`Falha ao tentar novamente: ${String(retryError?.message || retryError)}`);
        });
      };
    }
    return null;
  }
  return controller;
}

if (typeof document !== 'undefined') {
  const start = () => {
    bootstrap().catch((error) => {
      // Nunca deixar a rejeição sem tratamento: registra e, se possível,
      // mostra o estado de erro diretamente (bootstrap() já tenta mostrar
      // o próprio erro internamente; este catch cobre falhas antes disso,
      // ex.: document/#app-root ausentes).
      console.error('[main] falha não tratada ao iniciar o aplicativo', error);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
