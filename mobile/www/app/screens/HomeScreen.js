// Tela Início: resumo da sessão, item atual, atalhos rápidos. Somente
// leitura + callbacks — nunca fala com adapters/Capacitor diretamente.

import { icon } from '../icons/icons.js';
import { EmptyState } from '../components/EmptyState.js';

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}min ${rem}s` : `${rem}s`;
}

export class HomeScreen {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('HomeScreen: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = { present: [], import: [], editPlaylist: [] };
    this._buildDom();
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('home-screen-content');

    this.emptyStateEl = this._doc.createElement('div');
    this.emptyState = new EmptyState({ root: this.emptyStateEl });
    this.emptyStateEl.hidden = true;

    this.summaryCardEl = this._doc.createElement('section');
    this.summaryCardEl.className = 'home-summary-card';

    this.actionsEl = this._doc.createElement('div');
    this.actionsEl.className = 'home-actions';

    this.presentButtonEl = this._doc.createElement('button');
    this.presentButtonEl.type = 'button';
    this.presentButtonEl.className = 'btn btn-primary';
    this.presentButtonEl.innerHTML = `${icon('presentation')}<span>Apresentar</span>`;
    this.presentButtonEl.addEventListener('click', () => this._handlers.present.forEach((cb) => cb()));

    this.importButtonEl = this._doc.createElement('button');
    this.importButtonEl.type = 'button';
    this.importButtonEl.className = 'btn';
    this.importButtonEl.innerHTML = `${icon('import')}<span>Importar mídia</span>`;
    this.importButtonEl.addEventListener('click', () => this._handlers.import.forEach((cb) => cb()));

    this.editPlaylistButtonEl = this._doc.createElement('button');
    this.editPlaylistButtonEl.type = 'button';
    this.editPlaylistButtonEl.className = 'btn btn-quiet';
    this.editPlaylistButtonEl.innerHTML = `${icon('playlist')}<span>Editar playlist</span>`;
    this.editPlaylistButtonEl.addEventListener('click', () => this._handlers.editPlaylist.forEach((cb) => cb()));

    this.actionsEl.append(this.presentButtonEl, this.importButtonEl, this.editPlaylistButtonEl);
    this._root.append(this.emptyStateEl, this.summaryCardEl, this.actionsEl);
  }

  /**
   * @param {{itemCount:number, totalDurationSec:number, currentName:string|null, isPresenting:boolean}} state
   */
  render({ itemCount = 0, totalDurationSec = 0, currentName = null, isPresenting = false } = {}) {
    if (itemCount === 0) {
      this.emptyStateEl.hidden = false;
      this.emptyState.render({
        icon: 'playlist',
        title: 'Nenhuma mídia ainda',
        description: 'Importe imagens e vídeos para montar sua primeira apresentação.',
        actionLabel: 'Importar mídia',
        onAction: () => this._handlers.import.forEach((cb) => cb()),
      });
      this.summaryCardEl.hidden = true;
      this.presentButtonEl.disabled = true;
    } else {
      this.emptyStateEl.hidden = true;
      this.summaryCardEl.hidden = false;
      this.presentButtonEl.disabled = false;
      this.summaryCardEl.innerHTML = `
        <div class="home-summary-stats">
          <div><div class="home-stat-value">${itemCount}</div><div class="home-stat-label">${itemCount === 1 ? 'item' : 'itens'}</div></div>
          <div><div class="home-stat-value">${formatDuration(totalDurationSec)}</div><div class="home-stat-label">duração estimada</div></div>
        </div>
        <div class="home-current-item">
          <span class="media-panel-label">${isPresenting ? 'Apresentando agora' : 'Última mídia'}</span>
          <strong>${currentName ? String(currentName) : 'Nenhuma mídia selecionada'}</strong>
        </div>`;
    }
  }

  onPresent(cb) { if (typeof cb === 'function') this._handlers.present.push(cb); }
  onImportClick(cb) { if (typeof cb === 'function') this._handlers.import.push(cb); }
  onEditPlaylist(cb) { if (typeof cb === 'function') this._handlers.editPlaylist.push(cb); }
}
