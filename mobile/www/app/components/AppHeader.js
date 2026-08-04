// Barra superior: marca do app, título da seção atual, status e uma ação
// contextual opcional (ex.: "Limpar" na Playlist). Nunca usa hambúrguer —
// a navegação principal vive inteiramente na BottomNavigation.

export class AppHeader {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('AppHeader: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._actionHandler = null;
    this._buildDom();
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('app-header');

    this.markEl = this._doc.createElement('div');
    this.markEl.className = 'app-header-mark';
    this.markEl.textContent = 'FBS';
    this.markEl.setAttribute('aria-hidden', 'true');

    this.titlesEl = this._doc.createElement('div');
    this.titlesEl.className = 'app-header-titles';

    this.appNameEl = this._doc.createElement('div');
    this.appNameEl.className = 'app-header-app-name';
    this.appNameEl.textContent = 'FBS Screen Manager';

    this.titleEl = this._doc.createElement('h1');
    this.titleEl.className = 'app-header-title';

    this.titlesEl.append(this.appNameEl, this.titleEl);

    this.statusEl = this._doc.createElement('span');
    this.statusEl.className = 'app-header-status';
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.hidden = true;

    this.actionEl = this._doc.createElement('button');
    this.actionEl.type = 'button';
    this.actionEl.className = 'app-header-action btn btn-quiet';
    this.actionEl.hidden = true;
    this.actionEl.addEventListener('click', () => this._actionHandler?.());

    this._root.append(this.markEl, this.titlesEl, this.statusEl, this.actionEl);
  }

  /**
   * @param {object} state
   * @param {string} state.title - título da seção atual.
   * @param {string} [state.status] - badge de status (ex.: "3 itens"); omitido esconde o badge.
   * @param {{label:string, onClick:()=>void}} [state.action] - ação contextual; omitido esconde o botão.
   */
  render({ title, status, action } = {}) {
    this.titleEl.textContent = title || '';
    if (status) {
      this.statusEl.hidden = false;
      this.statusEl.textContent = status;
    } else {
      this.statusEl.hidden = true;
    }
    if (action) {
      this.actionEl.hidden = false;
      this.actionEl.textContent = action.label;
      this._actionHandler = action.onClick;
    } else {
      this.actionEl.hidden = true;
      this._actionHandler = null;
    }
  }
}
