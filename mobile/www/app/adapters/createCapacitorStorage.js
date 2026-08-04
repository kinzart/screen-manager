// Única borda desta etapa que importa @capacitor/filesystem e
// @capacitor/preferences. CapacitorStorage.js em si nunca importa
// Capacitor — recebe os plugins como dependências (ver seu construtor).
// Isso é o que torna CapacitorStorage testável em Node puro (com fakes) e
// mantém o core (mobile/www/app/core/**) livre de qualquer import de
// Capacitor.
//
// Não integrado ao bootstrap (mobile/www/app/main.js) nesta etapa —
// autorizado apenas para a Etapa 3+ (fluxo de interface).

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { CapacitorStorage } from './CapacitorStorage.js';

/**
 * Constrói um StoragePort real, sobre os plugins Capacitor instalados.
 * @param {{logger?: {warn:(payload:object)=>void}, now?: () => number}} [options]
 * @returns {CapacitorStorage}
 */
export function createCapacitorStorage({ logger, now } = {}) {
  return new CapacitorStorage({
    filesystem: Filesystem,
    preferences: Preferences,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    logger,
    now,
  });
}
