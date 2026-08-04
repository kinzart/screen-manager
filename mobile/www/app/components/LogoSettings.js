// Configuração funcional de logo e identidade: importar, pré-visualizar,
// remover, ativar/desativar, posição, tamanho, opacidade, margem, manter
// proporção. Fala só com o DOM e emite callbacks — quem resolve a mídia
// real (MediaPort) e persiste (StoragePort) é o AppController.

import { icon } from '../icons/icons.js';
import { LOGO_POSITIONS } from '../core/models.js';

const POSITION_LABELS = {
  'top-left': 'Superior esquerda',
  'top-right': 'Superior direita',
  'bottom-left': 'Inferior esquerda',
  'bottom-right': 'Inferior direita',
  center: 'Centro',
};

export class LogoSettings {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('LogoSettings: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = { import: [], remove: [], change: [] };
    this._buildDom();
  }

  _emitChange(patch) {
    this._handlers.change.forEach((cb) => cb(patch));
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.className = 'settings-section';

    this._root.insertAdjacentHTML('beforeend', '<div class="settings-section-title">Logo e identidade</div>');

    this.previewFrameEl = this._doc.createElement('div');
    this.previewFrameEl.className = 'logo-preview-frame';
    this.previewImageEl = this._doc.createElement('img');
    this.previewImageEl.className = 'logo-preview-image';
    this.previewImageEl.hidden = true;
    this.previewFrameEl.appendChild(this.previewImageEl);

    const importRow = this._doc.createElement('div');
    importRow.className = 'settings-row';
    this.importButtonEl = this._doc.createElement('button');
    this.importButtonEl.type = 'button';
    this.importButtonEl.className = 'btn';
    this.importButtonEl.innerHTML = `${icon('import')}<span>Importar logo</span>`;
    this.importButtonEl.addEventListener('click', () => this._handlers.import.forEach((cb) => cb()));
    this.removeButtonEl = this._doc.createElement('button');
    this.removeButtonEl.type = 'button';
    this.removeButtonEl.className = 'btn btn-danger';
    this.removeButtonEl.innerHTML = `${icon('delete')}<span>Remover</span>`;
    this.removeButtonEl.addEventListener('click', () => this._handlers.remove.forEach((cb) => cb()));
    importRow.append(this.importButtonEl, this.removeButtonEl);

    const enabledRow = this._doc.createElement('div');
    enabledRow.className = 'settings-row';
    enabledRow.innerHTML = '<span class="settings-row-label">Exibir logo na apresentação</span>';
    this.enabledSwitchEl = this._doc.createElement('button');
    this.enabledSwitchEl.type = 'button';
    this.enabledSwitchEl.className = 'switch';
    this.enabledSwitchEl.setAttribute('role', 'switch');
    this.enabledSwitchEl.innerHTML = '<span class="switch-knob"></span>';
    this.enabledSwitchEl.addEventListener('click', () => {
      const next = !this._enabled;
      this._enabled = next;
      this._applyEnabled();
      this._emitChange({ enabled: next });
    });
    enabledRow.appendChild(this.enabledSwitchEl);

    this.positionGridEl = this._doc.createElement('div');
    this.positionGridEl.className = 'position-grid';
    this._positionButtons = new Map();
    for (const pos of LOGO_POSITIONS) {
      const btn = this._doc.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', POSITION_LABELS[pos]);
      btn.title = POSITION_LABELS[pos];
      btn.textContent = '●';
      btn.addEventListener('click', () => this._emitChange({ position: pos }));
      this.positionGridEl.appendChild(btn);
      this._positionButtons.set(pos, btn);
    }

    this.sizeRangeEl = this._makeRange('Tamanho', 'size', 5, 60, (v) => this._emitChange({ size: v }));
    this.opacityRangeEl = this._makeRange('Opacidade', 'opacity', 10, 100, (v) => this._emitChange({ opacity: v }));
    this.marginRangeEl = this._makeRange('Margem', 'margin', 0, 64, (v) => this._emitChange({ margin: v }));

    const keepAspectRow = this._doc.createElement('div');
    keepAspectRow.className = 'settings-row';
    keepAspectRow.innerHTML = '<span class="settings-row-label">Manter proporção</span>';
    this.keepAspectSwitchEl = this._doc.createElement('button');
    this.keepAspectSwitchEl.type = 'button';
    this.keepAspectSwitchEl.className = 'switch';
    this.keepAspectSwitchEl.setAttribute('role', 'switch');
    this.keepAspectSwitchEl.innerHTML = '<span class="switch-knob"></span>';
    this.keepAspectSwitchEl.addEventListener('click', () => {
      const next = !this._keepAspect;
      this._keepAspect = next;
      this.keepAspectSwitchEl.classList.toggle('is-on', next);
      this._emitChange({ keepAspect: next });
    });
    keepAspectRow.appendChild(this.keepAspectSwitchEl);

    this._root.append(
      this.previewFrameEl,
      importRow,
      enabledRow,
      this.positionGridEl,
      this.sizeRangeEl.wrap,
      this.opacityRangeEl.wrap,
      this.marginRangeEl.wrap,
      keepAspectRow,
    );
  }

  _makeRange(label, key, min, max, onInput) {
    const wrap = this._doc.createElement('label');
    wrap.className = 'form-field';
    wrap.innerHTML = `<span>${label}</span>`;
    const field = this._doc.createElement('div');
    field.className = 'range-field';
    const input = this._doc.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.setAttribute('aria-label', label);
    const valueEl = this._doc.createElement('span');
    valueEl.className = 'range-field-value';
    input.addEventListener('input', () => {
      valueEl.textContent = input.value;
      onInput(Number(input.value));
    });
    field.append(input, valueEl);
    wrap.appendChild(field);
    return { wrap, input, valueEl, key };
  }

  _applyEnabled() {
    this.enabledSwitchEl.classList.toggle('is-on', this._enabled);
    this.enabledSwitchEl.setAttribute('aria-checked', String(this._enabled));
  }

  /**
   * @param {object} state
   * @param {boolean} state.enabled
   * @param {string|null} state.previewSrc - null quando não há logo importado.
   * @param {string} state.position
   * @param {number} state.size
   * @param {number} state.opacity
   * @param {number} state.margin
   * @param {boolean} state.keepAspect
   */
  render({ enabled = false, previewSrc = null, position = 'bottom-right', size = 20, opacity = 100, margin = 16, keepAspect = true } = {}) {
    this._enabled = enabled;
    this._keepAspect = keepAspect;
    this._applyEnabled();
    this.keepAspectSwitchEl.classList.toggle('is-on', keepAspect);
    this.keepAspectSwitchEl.setAttribute('aria-checked', String(keepAspect));

    this.removeButtonEl.hidden = !previewSrc;
    if (previewSrc) {
      this.previewImageEl.hidden = false;
      this.previewImageEl.src = previewSrc;
      this._applyPreviewPosition(position, size, opacity, margin, keepAspect);
    } else {
      this.previewImageEl.hidden = true;
    }

    this._positionButtons.forEach((btn, pos) => btn.classList.toggle('is-selected', pos === position));
    this.sizeRangeEl.input.value = String(size);
    this.sizeRangeEl.valueEl.textContent = String(size);
    this.opacityRangeEl.input.value = String(opacity);
    this.opacityRangeEl.valueEl.textContent = String(opacity);
    this.marginRangeEl.input.value = String(margin);
    this.marginRangeEl.valueEl.textContent = String(margin);
  }

  _applyPreviewPosition(position, size, opacity, margin) {
    const img = this.previewImageEl;
    img.style.opacity = String(opacity / 100);
    img.style.width = `${size}%`;
    img.style.height = 'auto';
    img.style.top = img.style.right = img.style.bottom = img.style.left = '';
    img.style.margin = '0';
    const m = `${margin}px`;
    if (position === 'top-left') { img.style.top = m; img.style.left = m; }
    else if (position === 'top-right') { img.style.top = m; img.style.right = m; }
    else if (position === 'bottom-left') { img.style.bottom = m; img.style.left = m; }
    else if (position === 'bottom-right') { img.style.bottom = m; img.style.right = m; }
    else { img.style.margin = 'auto'; img.style.top = img.style.left = img.style.right = img.style.bottom = '0'; }
  }

  onImportClick(cb) { if (typeof cb === 'function') this._handlers.import.push(cb); }
  onRemoveClick(cb) { if (typeof cb === 'function') this._handlers.remove.push(cb); }
  /** Disparado a cada alteração de campo — recebe um patch parcial {campo: valor}. */
  onChange(cb) { if (typeof cb === 'function') this._handlers.change.push(cb); }
}
