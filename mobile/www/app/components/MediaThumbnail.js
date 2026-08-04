// Miniatura real de um item de playlist. Estados: loading, ok (imagem ou
// primeiro frame de vídeo), erro/indisponível (ícone de aviso). Nunca
// mostra apenas um quadrado com símbolo de play para imagens — o tipo de
// mídia só aparece como um badge pequeno no canto.

import { icon } from '../icons/icons.js';

export class MediaThumbnail {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('MediaThumbnail: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._root.classList.add('media-thumbnail');
  }

  /**
   * @param {object} state
   * @param {'image'|'video'} state.type
   * @param {'loading'|'ready'|'unavailable'} state.status
   * @param {string} [state.src] - necessário quando status === 'ready'.
   */
  render({ type, status, src } = {}) {
    this._root.innerHTML = '';
    this._root.setAttribute('aria-label', status === 'unavailable' ? 'Mídia indisponível' : type === 'video' ? 'Vídeo' : 'Imagem');

    if (status === 'ready' && src) {
      const el = this._doc.createElement(type === 'video' ? 'video' : 'img');
      if (type === 'video') {
        el.muted = true;
        el.preload = 'metadata';
      }
      el.src = src;
      this._root.appendChild(el);
    } else if (status === 'unavailable') {
      const wrap = this._doc.createElement('div');
      wrap.innerHTML = icon('warning');
      this._root.appendChild(wrap.firstChild);
    } else {
      const wrap = this._doc.createElement('div');
      wrap.innerHTML = icon(type === 'video' ? 'video' : 'image');
      this._root.appendChild(wrap.firstChild);
    }

    const badge = this._doc.createElement('span');
    badge.className = 'media-thumbnail-badge';
    badge.innerHTML = icon(type === 'video' ? 'video' : 'image');
    this._root.appendChild(badge);
  }
}
