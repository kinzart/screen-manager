// Implementação do contrato PresentationAdapter (core/ports.js) para
// apresentação NA PRÓPRIA TELA DO CELULAR — v1 do modo independente. Não
// implementa HDMI, casting ou segundo monitor (fora do escopo desta
// etapa). O futuro RemoteDesktopAdapter implementará o MESMO contrato
// controlando o Electron pela rede (não implementado aqui).
//
// Mapeia 1:1 aos comandos display:command do desktop
// (show/blackout/logo/pause/resume — src/display.js linhas 18-24),
// delegando a manipulação de DOM para PresenterView e as capacidades de
// plataforma (wake lock/orientação/fullscreen) para PresentationPlatform.
// Nunca importa Capacitor diretamente.

import { PresentationAdapter } from '../core/ports.js';

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[LocalPresentationAdapter]', JSON.stringify(payload));
    } catch {
      console.warn('[LocalPresentationAdapter]', payload);
    }
  },
};

export class LocalPresentationAdapter extends PresentationAdapter {
  /**
   * @param {object} deps
   * @param {import('../ui/PresenterView.js').PresenterView} deps.view
   * @param {import('./PresentationPlatform.js').PresentationPlatform} [deps.platform]
   * @param {(mediaRef: object) => Promise<string>} deps.resolveSrc - normalmente MediaPort.resolveSrc.
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   */
  constructor({ view, platform, resolveSrc, logger } = {}) {
    super();
    if (!view) throw new Error('LocalPresentationAdapter: "view" é obrigatório');
    if (typeof resolveSrc !== 'function') {
      throw new Error('LocalPresentationAdapter: "resolveSrc" é obrigatório (função)');
    }
    this._view = view;
    this._platform = platform || null;
    this._resolveSrc = resolveSrc;
    this._logger = logger || DEFAULT_LOGGER;
    this._statusHandlers = [];
    this._view.onStatus((status) => this._emitStatus(status));
  }

  _emitStatus(status) {
    this._statusHandlers.forEach((cb) => cb(status));
  }

  async show(item) {
    this._view.setLoading(true);
    try {
      const src = await this._resolveSrc(item.media);
      if (item.type === 'video') {
        this._view.showVideo(src, { fit: item.fit, transition: item.transition, loop: !!item.duration });
      } else {
        this._view.showImage(src, { fit: item.fit, transition: item.transition });
      }
    } catch (error) {
      const message = `Não foi possível exibir "${item?.name || item?.id || 'item'}": ${String(error?.message || error)}`;
      this._view.setError(message);
      this._logger.warn({ event: 'presentation.show-failed', error: message });
      this._emitStatus({ error: message });
    } finally {
      this._view.setLoading(false);
    }
  }

  async blackout() {
    this._view.blackout();
  }

  async logo() {
    this._view.logo();
  }

  async pause() {
    this._view.pause();
  }

  async resume() {
    this._view.resume();
  }

  async clear() {
    this._view.clear();
  }

  onStatus(callback) {
    if (typeof callback === 'function') this._statusHandlers.push(callback);
  }

  /**
   * Honesto por construção: `fullscreen` só é `true` quando a
   * PresentationPlatform injetada de fato suporta e a Fullscreen API real
   * está disponível — nunca afirmado apenas por a view ocupar 100% da
   * viewport via CSS. `remote` e `secondScreen` são sempre `false` nesta
   * etapa (v1 local-only; RemoteDesktopAdapter e segundo monitor Android
   * não são implementados aqui).
   */
  capabilities() {
    return {
      fullscreen: this._platform ? this._platform.fullscreenSupported() : false,
      remote: false,
      secondScreen: false,
    };
  }
}
