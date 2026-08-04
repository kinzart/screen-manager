// Barra de transporte: play/pause, próximo, anterior, blackout, logo.
// Todos os botões têm aria-label e ícones SVG locais (nunca emoji) e alvo
// de toque adequado (ver mobile/www/styles/*.css). Fala apenas com o DOM
// injetado e com o AppController via callbacks — nunca importa Capacitor.

import { icon } from '../icons/icons.js';

export class TransportBar {
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) {
      throw new Error('TransportBar: "root" deve ser um elemento DOM válido');
    }
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = { playPause: [], next: [], previous: [], blackout: [], logo: [] };
    this._buildDom();
  }

  _createButton(className, label, iconName) {
    const btn = this._doc.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = icon(iconName);
    return btn;
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('transport-root');

    this.currentNameEl = this._doc.createElement('span');
    this.currentNameEl.className = 'transport-current-name';
    this.currentNameEl.textContent = 'Nenhuma mídia';

    this.previousButtonEl = this._createButton('transport-previous', 'Item anterior', 'previous');
    this.previousButtonEl.addEventListener('click', () => this._handlers.previous.forEach((cb) => cb()));

    this.playPauseButtonEl = this._createButton('transport-play-pause presentation-play-pause', 'Reproduzir', 'play');
    this.playPauseButtonEl.addEventListener('click', () => this._handlers.playPause.forEach((cb) => cb()));

    this.nextButtonEl = this._createButton('transport-next', 'Próximo item', 'next');
    this.nextButtonEl.addEventListener('click', () => this._handlers.next.forEach((cb) => cb()));

    this.blackoutButtonEl = this._createButton('transport-blackout', 'Ativar blackout', 'blackout');
    this.blackoutButtonEl.addEventListener('click', () => this._handlers.blackout.forEach((cb) => cb()));

    this.logoButtonEl = this._createButton('transport-logo', 'Exibir logo', 'logo');
    this.logoButtonEl.addEventListener('click', () => this._handlers.logo.forEach((cb) => cb()));

    this._root.append(
      this.currentNameEl,
      this.previousButtonEl,
      this.playPauseButtonEl,
      this.nextButtonEl,
      this.blackoutButtonEl,
      this.logoButtonEl,
    );
  }

  render({ currentName, isPlaying } = {}) {
    this.currentNameEl.textContent = currentName || 'Nenhuma mídia';
    this.playPauseButtonEl.innerHTML = icon(isPlaying ? 'pause' : 'play');
    this.playPauseButtonEl.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproduzir');
  }

  onPlayPause(cb) {
    if (typeof cb === 'function') this._handlers.playPause.push(cb);
  }

  onNext(cb) {
    if (typeof cb === 'function') this._handlers.next.push(cb);
  }

  onPrevious(cb) {
    if (typeof cb === 'function') this._handlers.previous.push(cb);
  }

  onBlackout(cb) {
    if (typeof cb === 'function') this._handlers.blackout.push(cb);
  }

  onLogo(cb) {
    if (typeof cb === 'function') this._handlers.logo.push(cb);
  }
}
