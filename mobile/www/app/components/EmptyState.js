import { icon } from '../icons/icons.js';

export class EmptyState {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('EmptyState: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._root.classList.add('empty-state');
    this._actionHandler = null;
  }

  /** @param {{icon:string, title:string, description:string, actionLabel?:string, onAction?:()=>void}} state */
  render({ icon: iconName = 'playlist', title, description, actionLabel, onAction } = {}) {
    this._root.innerHTML = '';
    const iconWrap = this._doc.createElement('div');
    iconWrap.className = 'empty-state-icon';
    iconWrap.innerHTML = icon(iconName);
    const titleEl = this._doc.createElement('div');
    titleEl.className = 'empty-state-title';
    titleEl.textContent = title || '';
    const descEl = this._doc.createElement('p');
    descEl.className = 'empty-state-description';
    descEl.textContent = description || '';
    this._root.append(iconWrap, titleEl, descEl);
    if (actionLabel) {
      const btn = this._doc.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => onAction?.());
      this._root.appendChild(btn);
    }
  }
}
