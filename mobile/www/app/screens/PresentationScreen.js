// Tela Apresentação — estado PARADO (o estado apresentando/fullscreen é
// montado pelo AppShell, que já possui PresenterView/TransportBar
// testados; aqui vive só o painel de "antes de apresentar": item atual,
// próximo item e o botão grande de iniciar).

import { icon } from '../icons/icons.js';
import { displayNameFor } from '../core/models.js';

export class PresentationScreen {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('PresentationScreen: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = { present: [] };
    this._buildDom();
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('presentation-idle');

    this.currentPanelEl = this._doc.createElement('div');
    this.currentPanelEl.className = 'media-panel';
    this.currentPanelEl.innerHTML = '<div><span class="media-panel-label">Item atual</span><div class="media-panel-name">Nenhuma mídia</div></div>';

    this.nextPanelEl = this._doc.createElement('div');
    this.nextPanelEl.className = 'media-panel';
    this.nextPanelEl.innerHTML = '<div><span class="media-panel-label">Próximo</span><div class="media-panel-name">Fila vazia</div></div>';

    this.startButtonEl = this._doc.createElement('button');
    this.startButtonEl.type = 'button';
    this.startButtonEl.className = 'btn btn-primary presentation-start-button';
    this.startButtonEl.innerHTML = `${icon('play')}<span>Apresentar</span>`;
    this.startButtonEl.addEventListener('click', () => this._handlers.present.forEach((cb) => cb()));

    this._root.append(this.currentPanelEl, this.nextPanelEl, this.startButtonEl);
  }

  /** @param {{currentItem: object|null, nextItem: object|null, hasItems: boolean}} state */
  render({ currentItem = null, nextItem = null, hasItems = false } = {}) {
    this.currentPanelEl.querySelector('.media-panel-name').textContent = currentItem ? displayNameFor(currentItem) : 'Nenhuma mídia';
    this.nextPanelEl.querySelector('.media-panel-name').textContent = nextItem ? displayNameFor(nextItem) : (hasItems ? 'Fim da fila' : 'Fila vazia');
    this.startButtonEl.disabled = !hasItems;
  }

  onPresent(cb) { if (typeof cb === 'function') this._handlers.present.push(cb); }
}
