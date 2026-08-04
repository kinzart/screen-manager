// View de apresentação (tela cheia visual, dentro da própria WebView).
// Reproduz/adapta a lógica de src/display.js (show/blackout/logo/pause/
// resume, elementos <img>/<video> com autoplay/muted/playsInline) para uma
// única página mobile, mais os requisitos novos desta etapa: estado de
// carregamento, estado de erro, evento "ended", classes fit contain/cover,
// e um botão de saída/controles ocultáveis (que o desktop não tinha).
//
// Recebe o elemento raiz por injeção — nunca importa Capacitor nem toca
// `window`/`document` global diretamente (usa `root.ownerDocument`), o que
// a torna testável com qualquer implementação de DOM (jsdom nos testes,
// DOM real da WebView em produção).

import { icon } from '../icons/icons.js';

const KNOWN_TRANSITIONS = ['cut', 'fade', 'slide-left', 'slide-up', 'zoom'];
const DEFAULT_TRANSITION = 'fade';

export class PresenterView {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.root - elemento container onde a view é montada.
   * @param {string} [deps.logoSrc] - src da imagem de logo (ex.: resolvido via MediaPort ou asset estático).
   */
  constructor({ root, logoSrc = '' } = {}) {
    if (!root || !root.ownerDocument) {
      throw new Error('PresenterView: "root" deve ser um elemento DOM válido');
    }
    this._root = root;
    this._doc = root.ownerDocument;
    this._logoSrc = logoSrc;
    this._statusHandlers = [];
    this._exitHandlers = [];
    this._currentMediaEl = null;
    this._buildDom();
  }

  _createEl(tag, className) {
    const el = this._doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('presenter-root');

    this.stageEl = this._createEl('div', 'presenter-stage');
    this.mediaSlotEl = this._createEl('div', 'presenter-media-slot');

    this.blackoutEl = this._createEl('div', 'presenter-blackout');
    this.blackoutEl.hidden = true;

    this.logoEl = this._createEl('img', 'presenter-logo');
    this.logoEl.src = this._logoSrc;
    this.logoEl.hidden = true;

    this.loadingEl = this._createEl('div', 'presenter-loading');
    this.loadingEl.hidden = true;
    this.loadingEl.textContent = 'Carregando…';

    this.errorEl = this._createEl('div', 'presenter-error');
    this.errorEl.hidden = true;

    this.watermarkEl = this._createEl('img', 'presenter-watermark');
    this.watermarkEl.hidden = true;
    this.watermarkEl.setAttribute('aria-hidden', 'true');

    this.controlsEl = this._createEl('div', 'presenter-controls');
    this.exitButtonEl = this._createEl('button', 'presenter-exit');
    this.exitButtonEl.type = 'button';
    this.exitButtonEl.className = 'presenter-exit presentation-exit-button';
    this.exitButtonEl.setAttribute('aria-label', 'Sair da apresentação');
    this.exitButtonEl.innerHTML = icon('close');
    this.exitButtonEl.addEventListener('click', () => this._exitHandlers.forEach((cb) => cb()));
    this.controlsEl.appendChild(this.exitButtonEl);

    this.stageEl.append(this.mediaSlotEl, this.blackoutEl, this.logoEl, this.watermarkEl, this.loadingEl, this.errorEl, this.controlsEl);
    this._root.appendChild(this.stageEl);
  }

  /**
   * Marca d'água persistente sobre a mídia (Configurações → Logo e
   * identidade) — DIFERENTE do logo() de tela cheia (comando manual que
   * substitui a mídia inteira, espelhando src/display.js). Fica coberta
   * pelo blackout/logo de tela cheia (z-index menor, ver presenter.css).
   * @param {{enabled:boolean, src:string|null, position:string, size:number, opacity:number, margin:number, keepAspect:boolean}} state
   */
  setWatermark({ enabled, src, position = 'bottom-right', size = 20, opacity = 100, margin = 16 } = {}) {
    if (!enabled || !src) {
      this.watermarkEl.hidden = true;
      return;
    }
    this.watermarkEl.hidden = false;
    this.watermarkEl.src = src;
    this.watermarkEl.style.opacity = String(Math.max(0, Math.min(100, opacity)) / 100);
    this.watermarkEl.style.width = `${size}%`;
    this.watermarkEl.style.height = 'auto';
    this.watermarkEl.style.top = this.watermarkEl.style.right = this.watermarkEl.style.bottom = this.watermarkEl.style.left = '';
    this.watermarkEl.style.margin = '0';
    const m = `${margin}px`;
    if (position === 'top-left') { this.watermarkEl.style.top = m; this.watermarkEl.style.left = m; }
    else if (position === 'top-right') { this.watermarkEl.style.top = m; this.watermarkEl.style.right = m; }
    else if (position === 'bottom-left') { this.watermarkEl.style.bottom = m; this.watermarkEl.style.left = m; }
    else if (position === 'bottom-right') { this.watermarkEl.style.bottom = m; this.watermarkEl.style.right = m; }
    else { this.watermarkEl.style.margin = 'auto'; this.watermarkEl.style.top = this.watermarkEl.style.left = this.watermarkEl.style.right = this.watermarkEl.style.bottom = '0'; }
  }

  _clearMediaSlot() {
    this.mediaSlotEl.innerHTML = '';
    this._currentMediaEl = null;
  }

  _fitClass(fit) {
    // Fallback seguro: qualquer valor desconhecido cai em "contain".
    return fit === 'cover' ? 'fit-cover' : 'fit-contain';
  }

  _transitionClass(transition) {
    const value = KNOWN_TRANSITIONS.includes(transition) ? transition : DEFAULT_TRANSITION;
    return `enter-${value}`;
  }

  _emitStatus(status) {
    this._statusHandlers.forEach((cb) => cb(status));
  }

  setLoading(isLoading) {
    this.loadingEl.hidden = !isLoading;
  }

  setError(message) {
    if (message) {
      this.errorEl.hidden = false;
      this.errorEl.textContent = message;
    } else {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
  }

  /** Mostra uma imagem. Limpa qualquer mídia anterior, blackout e logo. */
  showImage(src, { fit, transition } = {}) {
    this.setError('');
    this.blackoutEl.hidden = true;
    this.logoEl.hidden = true;
    this._clearMediaSlot();
    const img = this._createEl('img', `presenter-media ${this._fitClass(fit)} ${this._transitionClass(transition)}`);
    img.addEventListener('error', () => {
      const status = { error: 'Não foi possível carregar a imagem.' };
      this.setError(status.error);
      this._emitStatus(status);
    });
    img.src = src;
    this.mediaSlotEl.appendChild(img);
    this._currentMediaEl = img;
  }

  /** Mostra um vídeo. autoplay/muted/playsInline (reproduz src/display.js linha 14). */
  showVideo(src, { fit, transition, loop = false } = {}) {
    this.setError('');
    this.blackoutEl.hidden = true;
    this.logoEl.hidden = true;
    this._clearMediaSlot();
    const video = this._createEl('video', `presenter-media ${this._fitClass(fit)} ${this._transitionClass(transition)}`);
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.loop = !!loop;
    video.addEventListener('error', () => {
      const status = { error: 'Não foi possível reproduzir o vídeo.' };
      this.setError(status.error);
      this._emitStatus(status);
    });
    video.addEventListener('ended', () => this._emitStatus({ ended: true }));
    video.addEventListener('loadedmetadata', () => this._emitStatus({ loadedMetadata: true, duration: video.duration }));
    video.src = src;
    this.mediaSlotEl.appendChild(video);
    this._currentMediaEl = video;
  }

  /** Limpa a mídia atual (sem mostrar blackout nem logo). */
  clear() {
    this._clearMediaSlot();
    this.blackoutEl.hidden = true;
    this.logoEl.hidden = true;
    this.setError('');
  }

  blackout() {
    this._clearMediaSlot();
    this.logoEl.hidden = true;
    this.blackoutEl.hidden = false;
  }

  logo() {
    this._clearMediaSlot();
    this.blackoutEl.hidden = true;
    this.logoEl.hidden = false;
  }

  pause() {
    if (this._currentMediaEl && this._currentMediaEl.tagName === 'VIDEO') {
      this._currentMediaEl.pause();
    }
  }

  resume() {
    if (this._currentMediaEl && this._currentMediaEl.tagName === 'VIDEO') {
      const playResult = this._currentMediaEl.play();
      if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
    }
  }

  setControlsVisible(visible) {
    this.controlsEl.hidden = !visible;
  }

  onStatus(callback) {
    if (typeof callback === 'function') this._statusHandlers.push(callback);
  }

  /** Chamado quando o usuário toca no botão de saída (retorno ao editor). */
  onExit(callback) {
    if (typeof callback === 'function') this._exitHandlers.push(callback);
  }
}
