// Editor de playlist touch-first — v2 (Etapa 11): cards compactos com
// miniatura real + editor expansível por item (nunca todos os campos de
// todos os itens abertos ao mesmo tempo). API pública preservada
// (render/showFeedback/showError/onImportClick/onRemove/onMoveUp/
// onMoveDown/onEditField/onToggleLoop/onSelectItem) para não exigir
// nenhuma mudança em AppController além da resolução de thumbnails
// (parâmetro extra opcional de render(), retrocompatível).
//
// Nunca importa Capacitor nem Electron — fala apenas com o DOM (via
// `root` injetado) e comunica intenção do usuário ao AppController através
// de callbacks registrados.

import { icon } from '../icons/icons.js';
import { displayNameFor } from '../core/models.js';
import { MediaThumbnail } from '../components/MediaThumbnail.js';

const TRANSITIONS = ['cut', 'fade', 'slide-left', 'slide-up', 'zoom'];
const FITS = ['contain', 'cover'];

export class EditorView {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.root
   * @param {(message:string) => boolean|Promise<boolean>} [deps.confirmFn] - confirmação antes de excluir (síncrona ou assíncrona — ex.: um modal real); default sempre confirma.
   */
  constructor({ root, confirmFn } = {}) {
    if (!root || !root.ownerDocument) {
      throw new Error('EditorView: "root" deve ser um elemento DOM válido');
    }
    this._root = root;
    this._doc = root.ownerDocument;
    this._confirmFn = typeof confirmFn === 'function' ? confirmFn : () => true;
    this._expandedId = null;
    this._handlers = {
      importClick: [],
      remove: [],
      moveUp: [],
      moveDown: [],
      editField: [],
      toggleLoop: [],
      selectItem: [],
      reselectMedia: [],
    };
    this._buildDom();
  }

  _createEl(tag, className) {
    const el = this._doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('editor-root');

    this.toolbarEl = this._createEl('div', 'editor-toolbar');

    this.importButtonEl = this._createEl('button', 'editor-import btn btn-primary');
    this.importButtonEl.type = 'button';
    this.importButtonEl.setAttribute('aria-label', 'Importar mídia do aparelho');
    this.importButtonEl.innerHTML = `${icon('import')}<span>Importar mídia</span>`;
    this.importButtonEl.addEventListener('click', () => this._handlers.importClick.forEach((cb) => cb()));

    this.loopButtonEl = this._createEl('button', 'editor-loop btn');
    this.loopButtonEl.type = 'button';
    this.loopButtonEl.addEventListener('click', () => this._handlers.toggleLoop.forEach((cb) => cb()));

    this.toolbarEl.append(this.importButtonEl, this.loopButtonEl);

    this.feedbackEl = this._createEl('div', 'status-banner status-banner-success editor-feedback');
    this.feedbackEl.hidden = true;
    this.feedbackEl.setAttribute('role', 'status');

    this.errorEl = this._createEl('div', 'status-banner status-banner-error editor-error');
    this.errorEl.hidden = true;
    this.errorEl.setAttribute('role', 'alert');

    this.emptyStateEl = this._createEl('p', 'editor-empty');
    this.emptyStateEl.textContent = 'Nenhuma mídia na playlist. Toque em "Importar mídia" para começar.';
    this.emptyStateEl.hidden = true;

    this.listEl = this._createEl('ul', 'editor-list');
    this.listEl.setAttribute('role', 'list');

    this._root.append(this.toolbarEl, this.feedbackEl, this.errorEl, this.emptyStateEl, this.listEl);
  }

  _thumbnailFor(item, thumbnails) {
    const entry = thumbnails?.get ? thumbnails.get(item.id) : undefined;
    if (entry?.status === 'ready') return { type: item.type, status: 'ready', src: entry.src };
    if (entry?.status === 'unavailable') return { type: item.type, status: 'unavailable' };
    return { type: item.type, status: 'loading' };
  }

  _cardMarkup(item, index, total, { currentId, thumbnails } = {}) {
    const li = this._createEl('li', 'editor-item playlist-card-wrap');
    li.dataset.id = item.id;
    const isCurrent = currentId != null && currentId === item.id;

    const card = this._createEl('div', `playlist-card${isCurrent ? ' is-current' : ''}`);

    const thumbEl = this._createEl('div');
    const thumb = new MediaThumbnail({ root: thumbEl });
    thumb.render(this._thumbnailFor(item, thumbnails));

    const info = this._createEl('div', 'playlist-card-info');
    const name = this._createEl('strong', 'playlist-card-name editor-item-name');
    name.textContent = displayNameFor(item);
    const meta = this._createEl('div', 'playlist-card-meta');
    const typeText = item.type === 'video' ? 'Vídeo' : 'Imagem';
    const transitionText = item.transition || 'Automática';
    meta.innerHTML = `<span class="editor-item-type">${typeText}</span><span>${item.duration ?? 10}s</span><span>${transitionText}</span>${isCurrent ? '<span class="playlist-card-current-badge">No ar</span>' : ''}`;
    info.append(name, meta);

    if (this._thumbnailFor(item, thumbnails).status === 'unavailable') {
      const warn = this._createEl('div', 'media-unavailable');
      const reselectBtn = this._createEl('button', 'btn btn-quiet');
      reselectBtn.type = 'button';
      reselectBtn.textContent = 'Selecionar novamente';
      reselectBtn.addEventListener('click', () => this._handlers.reselectMedia.forEach((cb) => cb(item.id)));
      warn.innerHTML = `${icon('warning')}<span>Mídia indisponível</span>`;
      warn.appendChild(reselectBtn);
      info.appendChild(warn);
    }

    const actions = this._createEl('div', 'playlist-card-actions');

    const presentBtn = this._createEl('button', 'editor-item-present');
    presentBtn.type = 'button';
    presentBtn.setAttribute('aria-label', `Apresentar a partir de ${displayNameFor(item)}`);
    presentBtn.innerHTML = icon('play');
    presentBtn.addEventListener('click', () => this._handlers.selectItem.forEach((cb) => cb(item.id)));

    const moveUpBtn = this._createEl('button', 'editor-move-up');
    moveUpBtn.type = 'button';
    moveUpBtn.setAttribute('aria-label', `Mover ${displayNameFor(item)} para cima`);
    moveUpBtn.innerHTML = icon('moveUp');
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener('click', () => this._handlers.moveUp.forEach((cb) => cb(item.id)));

    const moveDownBtn = this._createEl('button', 'editor-move-down');
    moveDownBtn.type = 'button';
    moveDownBtn.setAttribute('aria-label', `Mover ${displayNameFor(item)} para baixo`);
    moveDownBtn.innerHTML = icon('moveDown');
    moveDownBtn.disabled = index === total - 1;
    moveDownBtn.addEventListener('click', () => this._handlers.moveDown.forEach((cb) => cb(item.id)));

    const moreBtn = this._createEl('button', 'editor-more');
    moreBtn.type = 'button';
    moreBtn.setAttribute('aria-label', `Editar ${displayNameFor(item)}`);
    moreBtn.setAttribute('aria-expanded', String(this._expandedId === item.id));
    moreBtn.innerHTML = icon('edit');
    moreBtn.addEventListener('click', () => {
      this._expandedId = this._expandedId === item.id ? null : item.id;
      this._renderList(this._lastItems, this._lastOptions);
    });

    actions.append(presentBtn, moveUpBtn, moveDownBtn, moreBtn);

    const right = this._createEl('div', 'playlist-card-right');
    right.append(info, actions);

    card.append(thumbEl, right);
    li.appendChild(card);

    if (this._expandedId === item.id) {
      li.appendChild(this._editorPanelMarkup(item));
    }
    return li;
  }

  _editorPanelMarkup(item) {
    const panel = this._createEl('div', 'playlist-item-editor editor-item-fields');

    const nameLabel = this._createEl('label', 'form-field editor-field');
    nameLabel.innerHTML = '<span>Nome</span>';
    const nameInput = this._createEl('input', 'editor-displayname');
    nameInput.type = 'text';
    nameInput.value = displayNameFor(item);
    nameInput.setAttribute('aria-label', `Nome de exibição de ${displayNameFor(item)}`);
    nameInput.addEventListener('change', (e) => {
      this._handlers.editField.forEach((cb) => cb(item.id, 'displayName', e.target.value));
    });
    nameLabel.appendChild(nameInput);

    const durationLabel = this._createEl('label', 'form-field editor-field');
    durationLabel.innerHTML = '<span>Duração (s)</span>';
    const durationInput = this._createEl('input', 'editor-duration');
    durationInput.type = 'number';
    durationInput.min = '0';
    durationInput.value = String(item.duration ?? 10);
    durationInput.setAttribute('aria-label', `Duração de ${displayNameFor(item)} em segundos`);
    durationInput.addEventListener('change', (e) => {
      this._handlers.editField.forEach((cb) => cb(item.id, 'duration', Math.max(0, Number(e.target.value))));
    });
    durationLabel.appendChild(durationInput);

    const transitionLabel = this._createEl('label', 'form-field editor-field');
    transitionLabel.innerHTML = '<span>Transição</span>';
    const transitionSelect = this._createEl('select', 'editor-transition');
    transitionSelect.setAttribute('aria-label', `Transição de ${displayNameFor(item)}`);
    const autoOption = this._createEl('option');
    autoOption.value = '';
    autoOption.textContent = 'Automática';
    transitionSelect.appendChild(autoOption);
    TRANSITIONS.forEach((t) => {
      const opt = this._createEl('option');
      opt.value = t;
      opt.textContent = t;
      if (item.transition === t) opt.selected = true;
      transitionSelect.appendChild(opt);
    });
    transitionSelect.addEventListener('change', (e) => {
      this._handlers.editField.forEach((cb) => cb(item.id, 'transition', e.target.value));
    });
    transitionLabel.appendChild(transitionSelect);

    const fitLabel = this._createEl('label', 'form-field editor-field');
    fitLabel.innerHTML = '<span>Ajuste</span>';
    const fitSelect = this._createEl('select', 'editor-fit');
    fitSelect.setAttribute('aria-label', `Ajuste de ${displayNameFor(item)}`);
    FITS.forEach((f) => {
      const opt = this._createEl('option');
      opt.value = f;
      opt.textContent = f;
      if ((item.fit || 'contain') === f) opt.selected = true;
      fitSelect.appendChild(opt);
    });
    fitSelect.addEventListener('change', (e) => {
      this._handlers.editField.forEach((cb) => cb(item.id, 'fit', e.target.value));
    });
    fitLabel.appendChild(fitSelect);

    const startAtLabel = this._createEl('label', 'form-field editor-field');
    startAtLabel.innerHTML = '<span>Horário (opcional)</span>';
    const startAtInput = this._createEl('input', 'editor-startat');
    startAtInput.type = 'time';
    startAtInput.step = '1';
    startAtInput.value = item.startAt || '';
    startAtInput.setAttribute('aria-label', `Horário agendado de ${displayNameFor(item)}`);
    startAtInput.addEventListener('change', (e) => {
      this._handlers.editField.forEach((cb) => cb(item.id, 'startAt', e.target.value));
    });
    startAtLabel.appendChild(startAtInput);

    const grid = this._createEl('div', 'form-grid');
    grid.append(nameLabel, durationLabel, transitionLabel, fitLabel, startAtLabel);

    const rowActions = this._createEl('div', 'form-row-actions');
    const deleteBtn = this._createEl('button', 'editor-delete btn btn-danger');
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', `Remover ${displayNameFor(item)} da playlist`);
    deleteBtn.innerHTML = `${icon('delete')}<span>Remover</span>`;
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await this._confirmFn(`Remover "${displayNameFor(item)}" da playlist?`);
      if (confirmed) this._handlers.remove.forEach((cb) => cb(item.id));
    });
    rowActions.appendChild(deleteBtn);

    panel.append(grid, rowActions);
    return panel;
  }

  _renderList(items, options) {
    this._lastItems = items;
    this._lastOptions = options;
    this.listEl.innerHTML = '';
    this.emptyStateEl.hidden = items.length > 0;
    items.forEach((item, index) => {
      this.listEl.appendChild(this._cardMarkup(item, index, items.length, options));
    });
  }

  /**
   * @param {Array} items
   * @param {object} [settings]
   * @param {{currentId?: string|null, thumbnails?: Map<string,{status:string,src?:string}>}} [extra] - opcional, retrocompatível.
   */
  render(items, settings, extra) {
    this._renderList(items, extra || {});
    this._updateLoopButton(!!settings?.loopPlaylist);
  }

  _updateLoopButton(loopEnabled) {
    this.loopButtonEl.innerHTML = `${icon('loop')}<span>${loopEnabled ? 'Loop ligado' : 'Loop desligado'}</span>`;
    this.loopButtonEl.setAttribute('aria-pressed', String(loopEnabled));
  }

  showFeedback(message) {
    if (!message) {
      this.feedbackEl.hidden = true;
      this.feedbackEl.textContent = '';
      return;
    }
    this.feedbackEl.hidden = false;
    this.feedbackEl.textContent = message;
  }

  showError(message) {
    if (!message) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
      return;
    }
    this.errorEl.hidden = false;
    this.errorEl.textContent = message;
  }

  onImportClick(cb) {
    if (typeof cb === 'function') this._handlers.importClick.push(cb);
  }

  onRemove(cb) {
    if (typeof cb === 'function') this._handlers.remove.push(cb);
  }

  onMoveUp(cb) {
    if (typeof cb === 'function') this._handlers.moveUp.push(cb);
  }

  onMoveDown(cb) {
    if (typeof cb === 'function') this._handlers.moveDown.push(cb);
  }

  onEditField(cb) {
    if (typeof cb === 'function') this._handlers.editField.push(cb);
  }

  onToggleLoop(cb) {
    if (typeof cb === 'function') this._handlers.toggleLoop.push(cb);
  }

  onSelectItem(cb) {
    if (typeof cb === 'function') this._handlers.selectItem.push(cb);
  }

  /** Disparado ao tocar em "Selecionar novamente" num item com mídia indisponível (modo web pós-reload). */
  onReselectMedia(cb) {
    if (typeof cb === 'function') this._handlers.reselectMedia.push(cb);
  }
}
