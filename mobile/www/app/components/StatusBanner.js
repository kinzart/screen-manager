// Banner de status/erro visível (substitui o texto cru anterior). Usado
// tanto como banner persistente (Playlist) quanto como toast com
// auto-dismiss (quando `autoDismissMs` é passado).

import { icon } from '../icons/icons.js';

export class StatusBanner {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('StatusBanner: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._root.classList.add('status-banner');
    this._root.hidden = true;
    this._dismissTimer = null;
  }

  /** @param {{kind:'success'|'error'|'info', message:string, autoDismissMs?:number}} [state] omitir esconde o banner. */
  render(state) {
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
    if (!state || !state.message) {
      this._root.hidden = true;
      this._root.textContent = '';
      return;
    }
    const { kind = 'info', message, autoDismissMs } = state;
    this._root.hidden = false;
    this._root.className = `status-banner status-banner-${kind}`;
    this._root.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    this._root.innerHTML = `${icon(kind === 'error' ? 'warning' : 'check')}<span></span>`;
    this._root.querySelector('span').textContent = message;
    if (autoDismissMs) {
      this._dismissTimer = setTimeout(() => this.render(null), autoDismissMs);
    }
  }
}
