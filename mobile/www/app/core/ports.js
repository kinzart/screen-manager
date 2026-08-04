// Contratos (portas) que o core depende, sem importar Capacitor ou
// Electron. Implementações concretas (CapacitorStorage, CapacitorMedia,
// LocalPresentationAdapter, RemoteDesktopAdapter) ficam em mobile/www/app/
// adapters/ (Etapas 2-4, não implementadas nesta etapa).
//
// JavaScript não possui interfaces nativas: usamos classes-base cujos
// métodos lançam NotImplementedError até serem sobrescritos por uma
// implementação concreta (subclasse). Isso torna erro de integração óbvio
// em tempo de execução em vez de silencioso.
//
// Núcleo puro: sem Electron, Capacitor ou DOM.

export class NotImplementedError extends Error {
  constructor(className, methodName) {
    super(`${className}.${methodName}() não implementado`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Códigos de erro estruturados que uma implementação de StoragePort pode
 * lançar (ex.: CapacitorStorage, Etapa 2). Ficam no core — são um conceito
 * de contrato, não uma dependência de Capacitor — para que qualquer
 * implementação de StoragePort (mobile, desktop futuro, testes) use os
 * mesmos códigos e o chamador nunca precise comparar mensagens de erro por
 * texto.
 */
export const StorageErrorCode = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  CORRUPTED_JSON: 'CORRUPTED_JSON',
  INVALID_MODEL: 'INVALID_MODEL',
  READ_FAILED: 'READ_FAILED',
  WRITE_FAILED: 'WRITE_FAILED',
  PREFERENCES_FAILED: 'PREFERENCES_FAILED',
});

/** Erro estruturado de uma implementação de StoragePort — ver StorageErrorCode. */
export class StorageError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * StoragePort — persistência de playlist, settings e estado de execução.
 * Espelha playlist:load/save e settings:load/save do desktop
 * (.docs/_audit/persistence-and-ipc.md), mas sobre Preferences/Filesystem
 * (Capacitor) em vez de IPC + fs.
 */
export class StoragePort {
  loadPlaylist() {
    throw new NotImplementedError('StoragePort', 'loadPlaylist');
  }

  savePlaylist(_items) {
    throw new NotImplementedError('StoragePort', 'savePlaylist');
  }

  loadSettings() {
    throw new NotImplementedError('StoragePort', 'loadSettings');
  }

  saveSettings(_settings) {
    throw new NotImplementedError('StoragePort', 'saveSettings');
  }

  loadRuntimeState() {
    throw new NotImplementedError('StoragePort', 'loadRuntimeState');
  }

  saveRuntimeState(_state) {
    throw new NotImplementedError('StoragePort', 'saveRuntimeState');
  }
}

/**
 * Códigos de erro estruturados que uma implementação de MediaPort pode
 * lançar (ex.: CapacitorMedia, Etapa 3). Mesma motivação de StorageError:
 * diferenciar falhas sem comparar mensagens de texto.
 */
export const MediaErrorCode = Object.freeze({
  CANCELED: 'CANCELED',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  PICK_FAILED: 'PICK_FAILED',
  COPY_FAILED: 'COPY_FAILED',
  INVALID_REF: 'INVALID_REF',
  DELETE_FAILED: 'DELETE_FAILED',
});

/** Erro estruturado de uma implementação de MediaPort — ver MediaErrorCode. */
export class MediaError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * MediaPort — importação e resolução de mídia. Substitui files:choose/
 * files:validate do desktop. pickMedia() NÃO é implementado nesta etapa
 * (ver ETAPA_1_REPORT.md e a correção técnica obrigatória da Etapa 0 —
 * @capacitor/filesystem não fornece seletor de mídia).
 */
export class MediaPort {
  pickMedia() {
    throw new NotImplementedError('MediaPort', 'pickMedia');
  }

  importToLibrary(_pickedFile) {
    throw new NotImplementedError('MediaPort', 'importToLibrary');
  }

  resolveSrc(_mediaRef) {
    throw new NotImplementedError('MediaPort', 'resolveSrc');
  }

  deleteFromLibrary(_mediaRef) {
    throw new NotImplementedError('MediaPort', 'deleteFromLibrary');
  }

  /**
   * Lê os bytes de uma mídia já importada como um Blob — usado apenas pelo
   * RemoteDesktopAdapter para transferir o arquivo pela rede até o
   * relay/TV (fora do escopo de apresentação local, onde resolveSrc já
   * basta). Implementação opcional: nem toda MediaPort precisa suportar
   * modo remoto.
   * @returns {Promise<Blob>}
   */
  readBlob(_mediaRef) {
    throw new NotImplementedError('MediaPort', 'readBlob');
  }
}

/**
 * PresentationAdapter — "onde/como apresentar". v1: LocalPresentationAdapter
 * (tela do próprio celular). Futuro: RemoteDesktopAdapter (LAN, controla o
 * Electron). Mapeia 1:1 aos comandos display:command do desktop
 * (show/blackout/logo/pause/resume — src/display.js linhas 18-24).
 */
export class PresentationAdapter {
  show(_item) {
    throw new NotImplementedError('PresentationAdapter', 'show');
  }

  blackout() {
    throw new NotImplementedError('PresentationAdapter', 'blackout');
  }

  logo() {
    throw new NotImplementedError('PresentationAdapter', 'logo');
  }

  pause() {
    throw new NotImplementedError('PresentationAdapter', 'pause');
  }

  resume() {
    throw new NotImplementedError('PresentationAdapter', 'resume');
  }

  clear() {
    throw new NotImplementedError('PresentationAdapter', 'clear');
  }

  onStatus(_callback) {
    throw new NotImplementedError('PresentationAdapter', 'onStatus');
  }

  capabilities() {
    throw new NotImplementedError('PresentationAdapter', 'capabilities');
  }
}
