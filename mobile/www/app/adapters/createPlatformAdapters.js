// Ponto único de decisão nativo vs. web para os adapters que dependem de
// plugins Capacitor. Único arquivo (além de createCapacitorStorage.js/
// createCapacitorMedia.js/createLifecycleCoordinator.js) autorizado a
// importar @capacitor/* — main.js delega a esta fábrica em vez de decidir
// sozinho.
//
// Detecção via Capacitor.isNativePlatform() (mecanismo oficial do próprio
// Capacitor — true dentro do runtime nativo Android/iOS, false em qualquer
// navegador, incluindo o teste via Safari do iPhone na rede local).
//
// MediaPort: única porta que realmente precisa de uma implementação web
// separada. CapacitorMedia.importToLibrary() depende de um `path` nativo
// que a implementação web do @capawesome/capacitor-file-picker nunca
// fornece (ver WebMediaAdapter.js) — por isso pickMedia/importToLibrary
// SEMPRE falhavam no navegador antes desta correção.
//
// StoragePort: NÃO tem uma implementação web separada aqui de propósito.
// @capacitor/filesystem e @capacitor/preferences já têm implementação web
// própria e funcional (IndexedDB e localStorage, respectivamente — ver
// node_modules/@capacitor/{filesystem,preferences}/dist/esm/web.js),
// mantida pelo próprio Capacitor. CapacitorStorage já funciona sem
// alteração nas duas plataformas — confirmado em teste real de navegador
// nesta recuperação (ver ETAPA_5C_RUNTIME_RECOVERY_REPORT.md). Criar um
// WebStorageAdapter redundante duplicaria uma implementação que já existe
// e já funciona.
//
// Lifecycle: pelo mesmo motivo, @capacitor/app já tem fallback web via
// `visibilitychange` (ver node_modules/@capacitor/app/dist/esm/web.js) —
// createLifecycleCoordinator.js já funciona nas duas plataformas sem
// alteração.

import { Capacitor } from '@capacitor/core';
import { createCapacitorStorage } from './createCapacitorStorage.js';
import { createCapacitorMedia } from './createCapacitorMedia.js';
import { WebMediaAdapter } from './WebMediaAdapter.js';

/**
 * @param {object} [options]
 * @param {Document} [options.doc] - necessário apenas no modo web (WebMediaAdapter usa <input type="file">).
 * @param {{warn:(payload:object)=>void}} [options.logger]
 * @param {() => number} [options.now]
 * @param {() => string} [options.generateId]
 * @param {boolean} [options.isNative] - override para testes; default: Capacitor.isNativePlatform().
 * @returns {{isNative: boolean, storage: import('./CapacitorStorage.js').CapacitorStorage, media: import('../core/ports.js').MediaPort}}
 */
export function createPlatformAdapters({ doc, logger, now, generateId, isNative } = {}) {
  const native = typeof isNative === 'boolean' ? isNative : Capacitor.isNativePlatform();
  return {
    isNative: native,
    storage: createCapacitorStorage({ logger, now }),
    media: native
      ? createCapacitorMedia({ logger, now, generateId })
      : new WebMediaAdapter({ doc, logger, generateId }),
  };
}
