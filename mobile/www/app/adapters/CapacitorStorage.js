// Implementação testável de StoragePort sobre @capacitor/filesystem (JSON
// de playlist/settings) e @capacitor/preferences (RuntimeState). Não
// importa nenhum plugin Capacitor diretamente — recebe as dependências
// pelo construtor (injeção de dependência), por isso pode ser testada em
// Node puro com fakes (ver mobile/tests/helpers/). A única borda que
// importa @capacitor/* de fato é createCapacitorStorage.js.
//
// Espelha playlist:load/save e settings:load/save do desktop
// (main.js, .docs/_audit/persistence-and-ipc.md), com dois desvios
// deliberados: (1) RuntimeState é um conceito novo do mobile, sem
// equivalente desktop; (2) todo dado lido do disco é validado com as
// funções reais de models.js antes de ser devolvido ao chamador.

import { StoragePort, StorageError, StorageErrorCode } from '../core/ports.js';
import { validatePlaylistItem, validateSettings, validateRuntimeState } from '../core/models.js';

/** Diretório (relativo a `directory`) onde os arquivos JSON persistentes ficam. */
export const STATE_DIR = 'state';
/** Caminho estável do arquivo de playlist — nunca espalhar essa string em outro lugar. */
export const PLAYLIST_PATH = `${STATE_DIR}/playlist.json`;
/** Caminho estável do arquivo de settings. */
export const SETTINGS_PATH = `${STATE_DIR}/settings.json`;
/** Chave do Preferences para o RuntimeState — namespaced e versionada. */
export const RUNTIME_STATE_KEY = 'fbs.mobile.runtimeState.v1';
/** Defaults de Settings quando o arquivo ainda não existe (espelha main.js linha 16). */
export const DEFAULT_SETTINGS = Object.freeze({ rules: [], defaultFit: 'contain', loopPlaylist: true });

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[CapacitorStorage]', JSON.stringify(payload));
    } catch {
      console.warn('[CapacitorStorage]', payload);
    }
  },
};

/**
 * Normaliza "arquivo/entrada não encontrado" através dos formatos
 * observáveis: a implementação web do plugin lança `Error('File does not
 * exist.')` (ver node_modules/@capacitor/filesystem/dist/esm/web.js); a
 * implementação nativa (Android/iOS) usa um `PluginError { code, message }`
 * com códigos no formato "OS-PLUG-FILE-XXXX" que não pôde ser verificado
 * neste ambiente (sem device/emulador — ver ETAPA_2_REPORT.md, seção de
 * bloqueios). Esta função cobre o formato web confirmado e um `code`
 * genérico ENOENT-like; qualquer outro erro é tratado como falha real de
 * leitura, nunca como "arquivo ausente" — nunca engole um erro
 * desconhecido silenciosamente.
 */
export function isNotFoundError(error) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';
  return /does not exist/i.test(message) || /not found/i.test(message) || code === 'ENOENT';
}

function defensiveCopy(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export class CapacitorStorage extends StoragePort {
  /**
   * @param {object} deps
   * @param {object} deps.filesystem - subconjunto de FilesystemPlugin usado: mkdir, readFile, writeFile.
   * @param {object} deps.preferences - subconjunto de PreferencesPlugin usado: get, set.
   * @param {string} deps.directory - valor de Directory (ex.: Directory.Data). Nunca Documents/External.
   * @param {string} deps.encoding - valor de Encoding (ex.: Encoding.UTF8).
   * @param {{warn:(payload:object)=>void}} [deps.logger] - logger estruturado; default usa console.warn.
   * @param {() => number} [deps.now] - relógio opcional, só para diagnóstico/logs.
   */
  constructor({ filesystem, preferences, directory, encoding, logger, now } = {}) {
    super();
    if (!filesystem) throw new Error('CapacitorStorage: "filesystem" é obrigatório');
    if (!preferences) throw new Error('CapacitorStorage: "preferences" é obrigatório');
    if (directory === undefined || directory === null) {
      throw new Error('CapacitorStorage: "directory" é obrigatório (ex.: Directory.Data)');
    }
    if (encoding === undefined || encoding === null) {
      throw new Error('CapacitorStorage: "encoding" é obrigatório (ex.: Encoding.UTF8)');
    }
    this._fs = filesystem;
    this._prefs = preferences;
    this._directory = directory;
    this._encoding = encoding;
    this._logger = logger || DEFAULT_LOGGER;
    this._now = typeof now === 'function' ? now : () => Date.now();
    /**
     * Fila de escrita por caminho: garante que duas chamadas concorrentes de
     * save* para o MESMO arquivo, dentro deste mesmo processo JS, nunca
     * executem writeFile sobrepostas (o que poderia corromper o JSON no
     * meio de uma escrita). Ver LIMITAÇÃO DE ATOMICIDADE no
     * ETAPA_2_REPORT.md: isto NÃO garante atomicidade contra falhas
     * externas (processo/app morto no meio de uma escrita).
     */
    this._writeQueues = new Map();
  }

  _enqueueWrite(path, task) {
    const previous = this._writeQueues.get(path) || Promise.resolve();
    const next = previous.then(task, task);
    // A fila rastreada nunca deve travar em uma falha anterior — cada
    // chamador recebe o rejeito de `next` normalmente (não engolido aqui).
    this._writeQueues.set(path, next.catch(() => {}));
    return next;
  }

  async _ensureStateDir() {
    try {
      await this._fs.mkdir({ path: STATE_DIR, directory: this._directory, recursive: true });
    } catch (error) {
      // Com recursive:true, um diretório já existente não deveria lançar
      // (essa é a semântica documentada de "recursive"). Se lançar mesmo
      // assim por outro motivo, tratamos como falha real de escrita.
      if (!/already exist/i.test(error?.message || '')) {
        throw new StorageError(StorageErrorCode.WRITE_FAILED, `Falha ao criar diretório "${STATE_DIR}"`, { cause: error });
      }
    }
  }

  async _readJsonFile(path) {
    let raw;
    try {
      raw = await this._fs.readFile({ path, directory: this._directory, encoding: this._encoding });
    } catch (error) {
      if (isNotFoundError(error)) return { status: 'not-found' };
      throw new StorageError(StorageErrorCode.READ_FAILED, `Falha ao ler "${path}"`, { cause: error });
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.data);
    } catch (error) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'corrupted-json',
        path,
        error: String(error?.message || error),
        at: this._now(),
      });
      return { status: 'corrupted' };
    }
    return { status: 'ok', data: parsed };
  }

  async _writeJsonFile(path, value) {
    await this._ensureStateDir();
    return this._enqueueWrite(path, async () => {
      try {
        await this._fs.writeFile({
          path,
          data: JSON.stringify(value, null, 2),
          directory: this._directory,
          encoding: this._encoding,
          recursive: true,
        });
      } catch (error) {
        throw new StorageError(StorageErrorCode.WRITE_FAILED, `Falha ao escrever "${path}"`, { cause: error });
      }
    });
  }

  async loadPlaylist() {
    const result = await this._readJsonFile(PLAYLIST_PATH);
    if (result.status === 'not-found' || result.status === 'corrupted') return [];
    if (!Array.isArray(result.data)) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'invalid-model',
        path: PLAYLIST_PATH,
        error: 'conteúdo não é um array de PlaylistItem',
        at: this._now(),
      });
      return [];
    }
    try {
      result.data.forEach((item) => validatePlaylistItem(item));
    } catch (error) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'invalid-model',
        path: PLAYLIST_PATH,
        error: String(error.message),
        at: this._now(),
      });
      return [];
    }
    return defensiveCopy(result.data);
  }

  async savePlaylist(items) {
    if (!Array.isArray(items)) {
      throw new StorageError(StorageErrorCode.INVALID_MODEL, 'savePlaylist: items deve ser um array');
    }
    items.forEach((item) => {
      try {
        validatePlaylistItem(item);
      } catch (error) {
        throw new StorageError(StorageErrorCode.INVALID_MODEL, `savePlaylist: item inválido: ${error.message}`, { cause: error });
      }
    });
    await this._writeJsonFile(PLAYLIST_PATH, items);
  }

  async loadSettings() {
    const result = await this._readJsonFile(SETTINGS_PATH);
    if (result.status === 'not-found' || result.status === 'corrupted') return defensiveCopy(DEFAULT_SETTINGS);
    try {
      validateSettings(result.data);
    } catch (error) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'invalid-model',
        path: SETTINGS_PATH,
        error: String(error.message),
        at: this._now(),
      });
      return defensiveCopy(DEFAULT_SETTINGS);
    }
    return defensiveCopy(result.data);
  }

  async saveSettings(settings) {
    try {
      validateSettings(settings);
    } catch (error) {
      throw new StorageError(StorageErrorCode.INVALID_MODEL, `saveSettings: settings inválido: ${error.message}`, { cause: error });
    }
    await this._writeJsonFile(SETTINGS_PATH, settings);
  }

  async loadRuntimeState() {
    let result;
    try {
      result = await this._prefs.get({ key: RUNTIME_STATE_KEY });
    } catch (error) {
      throw new StorageError(StorageErrorCode.PREFERENCES_FAILED, 'Falha ao ler RuntimeState do Preferences', { cause: error });
    }
    if (result?.value == null) return null;
    let parsed;
    try {
      parsed = JSON.parse(result.value);
    } catch (error) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'corrupted-json',
        key: RUNTIME_STATE_KEY,
        error: String(error?.message || error),
        at: this._now(),
      });
      return null;
    }
    try {
      validateRuntimeState(parsed);
    } catch (error) {
      this._logger.warn({
        event: 'storage.fallback',
        reason: 'invalid-model',
        key: RUNTIME_STATE_KEY,
        error: String(error.message),
        at: this._now(),
      });
      return null;
    }
    return defensiveCopy(parsed);
  }

  async saveRuntimeState(state) {
    try {
      validateRuntimeState(state);
    } catch (error) {
      throw new StorageError(StorageErrorCode.INVALID_MODEL, `saveRuntimeState: estado inválido: ${error.message}`, { cause: error });
    }
    const value = JSON.stringify(state);
    try {
      await this._prefs.set({ key: RUNTIME_STATE_KEY, value });
    } catch (error) {
      throw new StorageError(StorageErrorCode.PREFERENCES_FAILED, 'Falha ao gravar RuntimeState no Preferences', { cause: error });
    }
  }
}
