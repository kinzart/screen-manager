// Única borda desta etapa que importa @capacitor/filesystem,
// @capacitor/core (para Capacitor.convertFileSrc) e
// @capawesome/capacitor-file-picker. CapacitorMedia.js em si nunca importa
// esses pacotes — recebe-os como dependências (ver seu construtor).
//
// Não integrado ao bootstrap (mobile/www/app/main.js) nesta etapa.

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { CapacitorMedia } from './CapacitorMedia.js';

/**
 * Constrói um MediaPort real, sobre os plugins instalados.
 * @param {{logger?: {warn:(payload:object)=>void}, now?: () => number, generateId?: () => string}} [options]
 * @returns {CapacitorMedia}
 */
export function createCapacitorMedia({ logger, now, generateId } = {}) {
  return new CapacitorMedia({
    filesystem: Filesystem,
    filePicker: FilePicker,
    directory: Directory.Data,
    convertFileSrc: (uri) => Capacitor.convertFileSrc(uri),
    logger,
    now,
    generateId,
  });
}
