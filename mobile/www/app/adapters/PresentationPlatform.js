// Capacidades de plataforma usadas durante a apresentação: manter a tela
// ligada (Wake Lock), travar orientação, e tela cheia real via Fullscreen
// API. Nenhuma delas é um plugin Capacitor — todas são APIs Web padrão,
// já suportadas pela WebView do Android/Chrome, conforme preferido pelo
// plano ("Prefira Screen Wake Lock API com feature detection" / "Não
// instale plugin comunitário de keep-awake sem justificar").
//
// Por isso esta etapa NÃO instala @capacitor/status-bar nem
// @capacitor/screen-orientation: nenhuma necessidade real foi identificada
// que a API Web padrão não cubra, e evitar plugins nativos extras reduz
// risco em um ambiente sem device/emulador para validar (ver
// ETAPA_4_REPORT.md).
//
// Esta classe nunca acessa `navigator`/`screen`/`document` diretamente —
// recebe os objetos (ou fakes, em teste) por injeção de dependência, o que
// a torna testável em Node puro.

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[PresentationPlatform]', JSON.stringify(payload));
    } catch {
      console.warn('[PresentationPlatform]', payload);
    }
  },
};

export class PresentationPlatform {
  /**
   * @param {object} [deps]
   * @param {{request:(type:string)=>Promise<{release:()=>Promise<void>}>}} [deps.wakeLock] - ex.: navigator.wakeLock.
   * @param {{lock:(orientation:string)=>Promise<void>, unlock:()=>void}} [deps.orientation] - ex.: screen.orientation.
   * @param {{request:(el:object)=>Promise<void>, exit:()=>Promise<void>}} [deps.fullscreen] - wrapper de Fullscreen API.
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   */
  constructor({ wakeLock, orientation, fullscreen, logger } = {}) {
    this._wakeLock = wakeLock || null;
    this._orientation = orientation || null;
    this._fullscreen = fullscreen || null;
    this._logger = logger || DEFAULT_LOGGER;
    this._wakeLockSentinel = null;
    this._isFullscreen = false;
  }

  wakeLockSupported() {
    return !!(this._wakeLock && typeof this._wakeLock.request === 'function');
  }

  async keepAwake() {
    if (!this.wakeLockSupported()) return { supported: false };
    try {
      this._wakeLockSentinel = await this._wakeLock.request('screen');
      return { supported: true };
    } catch (error) {
      this._logger.warn({ event: 'platform.wakelock-failed', error: String(error?.message || error) });
      return { supported: false, error };
    }
  }

  async allowSleep() {
    if (this._wakeLockSentinel && typeof this._wakeLockSentinel.release === 'function') {
      try {
        await this._wakeLockSentinel.release();
      } catch {
        // best-effort
      }
    }
    this._wakeLockSentinel = null;
  }

  orientationSupported() {
    return !!(this._orientation && typeof this._orientation.lock === 'function');
  }

  async lockOrientation(orientation) {
    if (!this.orientationSupported()) return { supported: false };
    try {
      await this._orientation.lock(orientation);
      return { supported: true };
    } catch (error) {
      this._logger.warn({ event: 'platform.orientation-failed', error: String(error?.message || error) });
      return { supported: false, error };
    }
  }

  unlockOrientation() {
    if (this._orientation && typeof this._orientation.unlock === 'function') {
      try {
        this._orientation.unlock();
      } catch {
        // best-effort
      }
    }
  }

  fullscreenSupported() {
    return !!(this._fullscreen && typeof this._fullscreen.request === 'function');
  }

  async enterFullscreen(element) {
    if (!this.fullscreenSupported()) return { supported: false };
    try {
      await this._fullscreen.request(element);
      this._isFullscreen = true;
      return { supported: true };
    } catch (error) {
      this._logger.warn({ event: 'platform.fullscreen-failed', error: String(error?.message || error) });
      return { supported: false, error };
    }
  }

  async exitFullscreen() {
    if (this._fullscreen && typeof this._fullscreen.exit === 'function') {
      try {
        await this._fullscreen.exit();
      } catch {
        // best-effort
      }
    }
    this._isFullscreen = false;
  }

  isFullscreen() {
    return this._isFullscreen;
  }
}
