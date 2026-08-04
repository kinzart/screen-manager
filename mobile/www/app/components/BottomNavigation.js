// Navegação principal fixa (4 itens). Nunca renderizada durante a
// apresentação fullscreen (AppShell remove/oculta o container inteiro
// nesse estado, não este componente).

import { icon } from '../icons/icons.js';

export const NAV_ITEMS = Object.freeze([
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'playlist', label: 'Playlist', icon: 'playlist' },
  { id: 'presentation', label: 'Apresentação', icon: 'presentation' },
  { id: 'settings', label: 'Configurações', icon: 'settings' },
]);

export class BottomNavigation {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('BottomNavigation: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = [];
    this._active = 'home';
    this._buildDom();
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('bottom-nav');
    this._root.setAttribute('role', 'tablist');
    this._buttons = new Map();
    for (const item of NAV_ITEMS) {
      const btn = this._doc.createElement('button');
      btn.type = 'button';
      btn.className = 'bottom-nav-item';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', item.label);
      btn.innerHTML = `${icon(item.icon)}<span>${item.label}</span>`;
      btn.addEventListener('click', () => this._select(item.id));
      this._root.appendChild(btn);
      this._buttons.set(item.id, btn);
    }
    this._applyActive();
  }

  _select(screenId) {
    if (screenId === this._active) return;
    this._active = screenId;
    this._applyActive();
    this._handlers.forEach((cb) => cb(screenId));
  }

  _applyActive() {
    this._buttons.forEach((btn, id) => {
      const isActive = id === this._active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }

  /** Define a aba ativa sem disparar callbacks (usado quando a navegação é forçada pelo controller, ex.: ao iniciar apresentação). */
  setActive(screenId) {
    this._active = screenId;
    this._applyActive();
  }

  get active() {
    return this._active;
  }

  onNavigate(cb) {
    if (typeof cb === 'function') this._handlers.push(cb);
  }
}
