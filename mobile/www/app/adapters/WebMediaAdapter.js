// Implementação de MediaPort para navegador puro (Capacitor.isNativePlatform()
// === false) — usado no teste via Safari do iPhone na rede local e em
// qualquer navegador desktop. Nunca importa Capacitor.
//
// Diferença deliberada em relação a CapacitorMedia.js: aqui não existe
// filesystem nativo nem `path` de picker nativo (ver
// node_modules/@capawesome/capacitor-file-picker/dist/esm/web.js — a
// implementação web do plugin retorna `path: undefined`, só `blob`, por
// isso CapacitorMedia.importToLibrary() SEMPRE falhava com INVALID_REF no
// navegador — essa era a causa raiz de "importar mídia" nunca funcionar no
// modo web). Este adapter usa <input type="file"> diretamente e mantém o
// Blob em memória, resolvido via URL.createObjectURL(). Ao recarregar a
// página, a mídia é perdida — aceitável neste modo (ver
// ETAPA_5C_RUNTIME_RECOVERY_REPORT.md); NUNCA declarar isto como
// persistência nativa nem como MediaPort validado em device.

import { MediaPort, MediaError, MediaErrorCode } from '../core/ports.js';
import { validateMediaRef, generateId as defaultGenerateId } from '../core/models.js';

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[WebMediaAdapter]', JSON.stringify(payload));
    } catch {
      console.warn('[WebMediaAdapter]', payload);
    }
  },
};

/** Extensão usada apenas para nomear o relPath sintético — não precisa cobrir todo mimeType existente. */
const EXT_FROM_MIME = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
});

function extFromMime(mime) {
  if (EXT_FROM_MIME[mime]) return EXT_FROM_MIME[mime];
  return mime && mime.startsWith('video/') ? 'video' : 'img';
}

export class WebMediaAdapter extends MediaPort {
  /**
   * @param {object} [deps]
   * @param {Document} [deps.doc] - default: `document` global.
   * @param {() => Promise<File[]>} [deps.openFilePicker] - injeção para testes; default: abre <input type="file"> real.
   * @param {() => string} [deps.generateId] - default: generateId de core/models.js.
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   */
  constructor({ doc, openFilePicker, generateId, logger } = {}) {
    super();
    this._doc = doc || (typeof document !== 'undefined' ? document : undefined);
    if (!this._doc && typeof openFilePicker !== 'function') {
      throw new Error('WebMediaAdapter: "doc" é obrigatório (DOM indisponível neste ambiente)');
    }
    this._openFilePickerFn = typeof openFilePicker === 'function' ? openFilePicker : () => this._defaultOpenFilePicker();
    this._generateId = typeof generateId === 'function' ? generateId : defaultGenerateId;
    this._logger = logger || DEFAULT_LOGGER;
    /** relPath -> { blob, objectUrl } — nunca sobrevive a um reload de página (modo web, sem persistência de mídia). */
    this._blobs = new Map();
  }

  _defaultOpenFilePicker() {
    const doc = this._doc;
    return new Promise((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.multiple = true;
      input.style.display = 'none';
      let settled = false;
      const cleanup = () => {
        input.removeEventListener('change', onChange);
        if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
        if (input.parentNode) input.parentNode.removeChild(input);
      };
      const finish = (files) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(files);
      };
      const onChange = () => finish(Array.from(input.files || []));
      // Sem evento nativo de cancelamento em <input type="file"> — usa o
      // mesmo workaround do plugin capawesome (foco devolvido à janela sem
      // 'change' anterior = usuário cancelou o seletor).
      const onFocus = () => {
        setTimeout(() => finish(Array.from(input.files || [])), 400);
      };
      input.addEventListener('change', onChange, { once: true });
      if (typeof window !== 'undefined') window.addEventListener('focus', onFocus, { once: true });
      doc.body.appendChild(input);
      input.click();
    });
  }

  /** Abre o seletor de arquivo do navegador. Retorna [] se o usuário cancelar (nunca lança por cancelamento). */
  async pickMedia() {
    let files;
    try {
      files = await this._openFilePickerFn();
    } catch (error) {
      throw new MediaError(MediaErrorCode.PICK_FAILED, 'Falha ao abrir o seletor de mídia (web)', { cause: error });
    }
    return (files || []).map((file) => ({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      _blob: file,
    }));
  }

  /** Não copia para nenhum filesystem real — mantém o Blob em memória, associado a um relPath sintético. */
  async importToLibrary(pickedFile) {
    if (!pickedFile || typeof pickedFile !== 'object' || pickedFile._blob == null) {
      throw new MediaError(MediaErrorCode.INVALID_REF, 'importToLibrary: pickedFile inválido (sem Blob)');
    }
    const mimeType = pickedFile.mimeType || pickedFile._blob?.type || '';
    if (!/^(image|video)\//.test(mimeType)) {
      throw new MediaError(
        MediaErrorCode.UNSUPPORTED_TYPE,
        `Tipo de mídia não suportado: ${mimeType || pickedFile.name || '(desconhecido)'}`,
      );
    }
    const ext = extFromMime(mimeType);
    const relPath = `library/${this._generateId()}.${ext}`;
    const bytes = Number.isInteger(pickedFile.size) ? pickedFile.size : Math.max(0, Math.round(Number(pickedFile.size) || 0));
    const mediaRef = { storage: 'sandbox', relPath, mime: mimeType, bytes };
    validateMediaRef(mediaRef);
    this._blobs.set(relPath, { blob: pickedFile._blob, objectUrl: null });
    return mediaRef;
  }

  /** Devolve o Blob real em memória — usado pelo RemoteDesktopAdapter para enviar o arquivo à TV/relay. */
  async readBlob(mediaRef) {
    validateMediaRef(mediaRef);
    const entry = this._blobs.get(mediaRef.relPath);
    if (!entry) {
      throw new MediaError(
        MediaErrorCode.INVALID_REF,
        `readBlob: mídia "${mediaRef.relPath}" indisponível nesta sessão (modo web: mídia não persiste entre recarregamentos de página)`,
      );
    }
    return entry.blob;
  }

  /** Resolve para uma blob: URL válida apenas durante esta sessão de página. */
  async resolveSrc(mediaRef) {
    validateMediaRef(mediaRef);
    const entry = this._blobs.get(mediaRef.relPath);
    if (!entry) {
      throw new MediaError(
        MediaErrorCode.INVALID_REF,
        `resolveSrc: mídia "${mediaRef.relPath}" indisponível nesta sessão (modo web: mídia não persiste entre recarregamentos de página)`,
      );
    }
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(entry.blob);
    return entry.objectUrl;
  }

  /** Libera o object URL e o Blob associado. Idempotente. */
  async deleteFromLibrary(mediaRef) {
    validateMediaRef(mediaRef);
    const entry = this._blobs.get(mediaRef.relPath);
    if (!entry) return;
    if (entry.objectUrl) {
      try {
        URL.revokeObjectURL(entry.objectUrl);
      } catch (error) {
        this._logger.warn({ event: 'webmedia.revoke-failed', error: String(error?.message || error) });
      }
    }
    this._blobs.delete(mediaRef.relPath);
  }
}
