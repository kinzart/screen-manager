// Implementação testável de MediaPort sobre @capawesome/capacitor-file-picker
// (seleção + cópia nativa) e @capacitor/filesystem (mkdir/getUri/deleteFile).
// Não importa nenhum plugin Capacitor diretamente — recebe as dependências
// pelo construtor (mesma estratégia de CapacitorStorage.js). A única borda
// que importa @capacitor/*/@capawesome/* é createCapacitorMedia.js.
//
// GARANTIA CENTRAL (arquivos grandes sem Base64): pickMedia() sempre chama
// o plugin com `readData: false` — os bytes do arquivo NUNCA atravessam o
// JavaScript como string Base64 nem ficam em memória no processo da
// WebView. A cópia do arquivo selecionado para o sandbox do app
// (`library/<uid>.<ext>`) é feita inteiramente do lado nativo por
// FilePickerPlugin.copyFile({from, to}), que recebe apenas caminhos —
// nunca dados. Ver ETAPA_3_REPORT.md, seção "Estratégia de arquivos
// grandes", para a investigação que justifica esta escolha de plugin.

import { MediaPort, MediaError, MediaErrorCode } from '../core/ports.js';
import { validateMediaRef, generateId as defaultGenerateId } from '../core/models.js';

/** Diretório (relativo a `directory`) onde a mídia copiada é guardada. */
export const LIBRARY_DIR = 'library';

/**
 * Tipos suportados, espelhando o conjunto do desktop (main.js SUPPORTED:
 * .png/.jpg/.jpeg/.webp/.gif/.mp4/.webm). Mapeamento intencionalmente mais
 * estrito que "qualquer image/* ou video/*" aceito por validateMediaRef —
 * um tipo tecnicamente image/video mas fora desta lista (ex.: image/heic)
 * é rejeitado como UNSUPPORTED_TYPE, por paridade com o desktop.
 */
export const MIME_TO_EXT = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
});

/** Mapa inverso, usado quando o picker não informa mimeType mas o nome do arquivo tem extensão reconhecível. */
const EXT_TO_MIME = Object.freeze(
  Object.fromEntries(Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime])),
);

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[CapacitorMedia]', JSON.stringify(payload));
    } catch {
      console.warn('[CapacitorMedia]', payload);
    }
  },
};

/**
 * Normaliza "usuário cancelou o picker" — mensagem confirmada da
 * implementação web do plugin (`ERROR_PICK_FILE_CANCELED = 'pickFiles
 * canceled.'`, node_modules/@capawesome/capacitor-file-picker/dist/esm/
 * web.js). O formato exato da mensagem/código nativo Android NÃO pôde ser
 * verificado neste ambiente (sem device — ver ETAPA_3_REPORT.md,
 * bloqueios). Esta função cobre o texto confirmado e a palavra genérica
 * "cancel"; qualquer outro erro do picker é tratado como falha real
 * (PICK_FAILED), nunca engolido como cancelamento silencioso.
 */
export function isCancelError(error) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  return /cancel/i.test(message);
}

/** Deriva o mimeType efetivo de um PickedFile, com fallback pela extensão do nome. */
function resolveMimeType(pickedFile) {
  if (typeof pickedFile.mimeType === 'string' && pickedFile.mimeType) {
    return pickedFile.mimeType;
  }
  const match = /\.([a-z0-9]+)$/i.exec(String(pickedFile.name || ''));
  const ext = match ? match[1].toLowerCase() : '';
  return EXT_TO_MIME[ext] || '';
}

function isWithinLibrary(relPath) {
  if (typeof relPath !== 'string' || !relPath.startsWith(`${LIBRARY_DIR}/`)) return false;
  return !relPath.split('/').includes('..');
}

function stripFileScheme(uri) {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

export class CapacitorMedia extends MediaPort {
  /**
   * @param {object} deps
   * @param {object} deps.filesystem - subconjunto de FilesystemPlugin: mkdir, getUri, deleteFile.
   * @param {object} deps.filePicker - subconjunto de FilePickerPlugin: pickMedia, copyFile.
   * @param {string} deps.directory - valor de Directory (ex.: Directory.Data).
   * @param {(uri: string) => string} [deps.convertFileSrc] - normalmente Capacitor.convertFileSrc; default identidade (útil em testes/quando fora do runtime Capacitor).
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   * @param {() => number} [deps.now]
   * @param {() => string} [deps.generateId] - default: generateId de core/models.js.
   */
  constructor({ filesystem, filePicker, directory, convertFileSrc, logger, now, generateId } = {}) {
    super();
    if (!filesystem) throw new Error('CapacitorMedia: "filesystem" é obrigatório');
    if (!filePicker) throw new Error('CapacitorMedia: "filePicker" é obrigatório');
    if (directory === undefined || directory === null) {
      throw new Error('CapacitorMedia: "directory" é obrigatório (ex.: Directory.Data)');
    }
    this._fs = filesystem;
    this._picker = filePicker;
    this._directory = directory;
    this._convertFileSrc = typeof convertFileSrc === 'function' ? convertFileSrc : (uri) => uri;
    this._logger = logger || DEFAULT_LOGGER;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._generateId = typeof generateId === 'function' ? generateId : defaultGenerateId;
  }

  async _ensureLibraryDir() {
    try {
      await this._fs.mkdir({ path: LIBRARY_DIR, directory: this._directory, recursive: true });
    } catch (error) {
      if (!/already exist/i.test(error?.message || '')) {
        throw new MediaError(MediaErrorCode.COPY_FAILED, `Falha ao criar diretório "${LIBRARY_DIR}"`, { cause: error });
      }
    }
  }

  async _resolveAbsolutePath(relPath) {
    const { uri } = await this._fs.getUri({ path: relPath, directory: this._directory });
    return stripFileScheme(uri);
  }

  async _cleanupPartial(relPath) {
    try {
      await this._fs.deleteFile({ path: relPath, directory: this._directory });
    } catch {
      // best-effort: o arquivo pode nunca ter chegado a existir no destino
    }
  }

  /**
   * Abre o seletor nativo de imagens/vídeos. SEMPRE com readData:false —
   * nunca solicita Base64. Retorna [] em caso de cancelamento (não é um
   * erro); erros reais do picker são relançados como MediaError(PICK_FAILED).
   */
  async pickMedia() {
    let result;
    try {
      result = await this._picker.pickMedia({ readData: false });
    } catch (error) {
      if (isCancelError(error)) return [];
      throw new MediaError(MediaErrorCode.PICK_FAILED, 'Falha ao abrir o seletor de mídia', { cause: error });
    }
    const files = Array.isArray(result?.files) ? result.files : [];
    return files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      // Caminho nativo temporário do picker — usado só por importToLibrary
      // nesta mesma sessão em memória; NUNCA persistido como MediaRef.
      _sourcePath: file.path,
    }));
  }

  /**
   * Copia o arquivo selecionado para library/<uid>.<ext> inteiramente do
   * lado nativo (FilePicker.copyFile), sem passar os bytes pelo JS.
   */
  async importToLibrary(pickedFile) {
    if (!pickedFile || typeof pickedFile !== 'object') {
      throw new MediaError(MediaErrorCode.INVALID_REF, 'importToLibrary: pickedFile inválido');
    }
    const mimeType = resolveMimeType(pickedFile);
    const ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      throw new MediaError(
        MediaErrorCode.UNSUPPORTED_TYPE,
        `Tipo de mídia não suportado: ${pickedFile.mimeType || pickedFile.name || '(desconhecido)'}`,
      );
    }
    const sourcePath = pickedFile._sourcePath || pickedFile.path;
    if (!sourcePath) {
      throw new MediaError(MediaErrorCode.INVALID_REF, 'importToLibrary: arquivo selecionado sem caminho nativo');
    }

    const relPath = `${LIBRARY_DIR}/${this._generateId()}.${ext}`;
    await this._ensureLibraryDir();
    const destination = await this._resolveAbsolutePath(relPath);

    try {
      await this._picker.copyFile({ from: sourcePath, to: destination, overwrite: false });
    } catch (error) {
      await this._cleanupPartial(relPath);
      throw new MediaError(MediaErrorCode.COPY_FAILED, `Falha ao copiar mídia para "${relPath}"`, { cause: error });
    }

    const bytes = Number.isInteger(pickedFile.size) ? pickedFile.size : Math.max(0, Math.round(Number(pickedFile.size) || 0));
    const mediaRef = { storage: 'sandbox', relPath, mime: mimeType, bytes };
    validateMediaRef(mediaRef);
    return mediaRef;
  }

  /** Resolve uma MediaRef em uma URL reproduzível (Capacitor.convertFileSrc quando disponível). */
  async resolveSrc(mediaRef) {
    validateMediaRef(mediaRef);
    if (!isWithinLibrary(mediaRef.relPath)) {
      throw new MediaError(MediaErrorCode.INVALID_REF, 'resolveSrc: MediaRef fora de library/');
    }
    let uri;
    try {
      const result = await this._fs.getUri({ path: mediaRef.relPath, directory: this._directory });
      uri = result.uri;
    } catch (error) {
      throw new MediaError(MediaErrorCode.INVALID_REF, `resolveSrc: não foi possível resolver "${mediaRef.relPath}"`, { cause: error });
    }
    return this._convertFileSrc(uri);
  }

  /** Remove um arquivo de library/. Idempotente: já-ausente não é erro. Bloqueia qualquer caminho fora de library/. */
  async deleteFromLibrary(mediaRef) {
    validateMediaRef(mediaRef);
    if (!isWithinLibrary(mediaRef.relPath)) {
      throw new MediaError(MediaErrorCode.INVALID_REF, 'deleteFromLibrary: MediaRef fora de library/ (bloqueado por segurança)');
    }
    try {
      await this._fs.deleteFile({ path: mediaRef.relPath, directory: this._directory });
    } catch (error) {
      if (/does not exist/i.test(error?.message || '')) return;
      throw new MediaError(MediaErrorCode.DELETE_FAILED, `Falha ao remover "${mediaRef.relPath}"`, { cause: error });
    }
  }
}
