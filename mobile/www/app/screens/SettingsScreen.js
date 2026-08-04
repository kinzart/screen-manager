// Tela Configurações: Aparência, Apresentação, Logo e identidade,
// Playlist, Agendamento, Armazenamento, Sobre. Comunica mudanças via
// callbacks — quem persiste (StoragePort) é o AppController.

import { icon } from '../icons/icons.js';
import { LogoSettings } from '../components/LogoSettings.js';
import { TRANSITIONS } from '../core/transitions.js';

function switchRow(doc, label, initialOn, onToggle) {
  const row = doc.createElement('div');
  row.className = 'settings-row';
  const labelEl = doc.createElement('span');
  labelEl.className = 'settings-row-label';
  labelEl.textContent = label;
  const sw = doc.createElement('button');
  sw.type = 'button';
  sw.className = `switch${initialOn ? ' is-on' : ''}`;
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(initialOn));
  sw.setAttribute('aria-label', label);
  sw.innerHTML = '<span class="switch-knob"></span>';
  let on = initialOn;
  sw.addEventListener('click', () => {
    on = !on;
    sw.classList.toggle('is-on', on);
    sw.setAttribute('aria-checked', String(on));
    onToggle(on);
  });
  row.append(labelEl, sw);
  return row;
}

export class SettingsScreen {
  /** @param {object} deps @param {HTMLElement} deps.root */
  constructor({ root } = {}) {
    if (!root || !root.ownerDocument) throw new Error('SettingsScreen: "root" deve ser um elemento DOM válido');
    this._root = root;
    this._doc = root.ownerDocument;
    this._handlers = { changeSettings: [], clearPlaylist: [], addRule: [], updateRule: [], removeRule: [], connectRemote: [], disconnectRemote: [] };
    this._buildDom();
  }

  _emit(patch) {
    this._handlers.changeSettings.forEach((cb) => cb(patch));
  }

  _buildDom() {
    this._root.innerHTML = '';

    // 1. Aparência
    const appearance = this._doc.createElement('section');
    appearance.className = 'settings-section';
    appearance.innerHTML = '<div class="settings-section-title">Aparência</div><div class="settings-row"><span class="settings-row-label">Tema</span><span class="app-header-status">Escuro (único disponível)</span></div>';

    // 2. Apresentação
    const presentation = this._doc.createElement('section');
    presentation.className = 'settings-section';
    presentation.innerHTML = '<div class="settings-section-title">Apresentação</div>';

    const durationLabel = this._doc.createElement('label');
    durationLabel.className = 'form-field';
    durationLabel.innerHTML = '<span>Duração padrão (s)</span>';
    this.defaultDurationInput = this._doc.createElement('input');
    this.defaultDurationInput.type = 'number';
    this.defaultDurationInput.min = '0';
    this.defaultDurationInput.setAttribute('aria-label', 'Duração padrão em segundos');
    this.defaultDurationInput.addEventListener('change', () => this._emit({ defaultDuration: Math.max(0, Number(this.defaultDurationInput.value)) }));
    durationLabel.appendChild(this.defaultDurationInput);

    const transitionLabel = this._doc.createElement('label');
    transitionLabel.className = 'form-field';
    transitionLabel.innerHTML = '<span>Transição padrão</span>';
    this.defaultTransitionSelect = this._doc.createElement('select');
    this.defaultTransitionSelect.setAttribute('aria-label', 'Transição padrão');
    ['', ...TRANSITIONS].forEach((t) => {
      const opt = this._doc.createElement('option');
      opt.value = t;
      opt.textContent = t || 'fade (padrão)';
      this.defaultTransitionSelect.appendChild(opt);
    });
    this.defaultTransitionSelect.addEventListener('change', () => this._emit({ defaultTransition: this.defaultTransitionSelect.value }));
    transitionLabel.appendChild(this.defaultTransitionSelect);

    const fitLabel = this._doc.createElement('label');
    fitLabel.className = 'form-field';
    fitLabel.innerHTML = '<span>Ajuste padrão</span>';
    this.defaultFitSelect = this._doc.createElement('select');
    this.defaultFitSelect.setAttribute('aria-label', 'Ajuste padrão');
    ['contain', 'cover'].forEach((f) => {
      const opt = this._doc.createElement('option');
      opt.value = f;
      opt.textContent = f;
      this.defaultFitSelect.appendChild(opt);
    });
    this.defaultFitSelect.addEventListener('change', () => this._emit({ defaultFit: this.defaultFitSelect.value }));
    fitLabel.appendChild(this.defaultFitSelect);

    const grid = this._doc.createElement('div');
    grid.className = 'form-grid';
    grid.append(durationLabel, transitionLabel, fitLabel);
    presentation.appendChild(grid);

    this._loopSwitchRow = switchRow(this._doc, 'Repetir playlist ao final', false, (v) => this._emit({ loopPlaylist: v }));
    presentation.appendChild(this._loopSwitchRow);

    this._autoHideRow = switchRow(this._doc, 'Esconder controles automaticamente', true, (v) => this._emit({ autoHideControls: v }));
    presentation.appendChild(this._autoHideRow);

    const delayLabel = this._doc.createElement('label');
    delayLabel.className = 'form-field';
    delayLabel.innerHTML = '<span>Tempo para esconder (ms)</span>';
    this.hideDelayInput = this._doc.createElement('input');
    this.hideDelayInput.type = 'number';
    this.hideDelayInput.min = '500';
    this.hideDelayInput.step = '500';
    this.hideDelayInput.setAttribute('aria-label', 'Tempo para esconder controles em milissegundos');
    this.hideDelayInput.addEventListener('change', () => this._emit({ hideControlsDelayMs: Math.max(500, Number(this.hideDelayInput.value)) }));
    delayLabel.appendChild(this.hideDelayInput);
    presentation.appendChild(delayLabel);

    this._showNextRow = switchRow(this._doc, 'Mostrar próximo item', true, (v) => this._emit({ showNextItem: v }));
    presentation.appendChild(this._showNextRow);
    this._showTimerRow = switchRow(this._doc, 'Mostrar timer', true, (v) => this._emit({ showTimer: v }));
    presentation.appendChild(this._showTimerRow);

    // Controle Remoto (TV) — apresenta numa TV/monitor conectada à
    // internet, controlado por este celular. Ver mobile/REMOTE_CONTROL.md.
    const remoteSection = this._doc.createElement('section');
    remoteSection.className = 'settings-section';
    remoteSection.innerHTML = '<div class="settings-section-title">Controle Remoto (TV)</div><p style="color:var(--text-muted);font-size:var(--font-size-xs);margin:0">Abra o endereço do servidor no navegador da TV (ex.: Smart TV, Chromecast, Fire TV) — ela mostrará um código de 4 dígitos. Digite o endereço e o código aqui para conectar.</p>';

    const serverLabel = this._doc.createElement('label');
    serverLabel.className = 'form-field';
    serverLabel.innerHTML = '<span>Endereço do servidor</span>';
    this.remoteServerInput = this._doc.createElement('input');
    this.remoteServerInput.type = 'url';
    this.remoteServerInput.placeholder = 'seu-servidor.exemplo.com (https)';
    this.remoteServerInput.setAttribute('aria-label', 'Endereço do servidor de controle remoto');
    serverLabel.appendChild(this.remoteServerInput);

    const roomLabel = this._doc.createElement('label');
    roomLabel.className = 'form-field';
    roomLabel.innerHTML = '<span>Código da TV</span>';
    this.remoteRoomInput = this._doc.createElement('input');
    this.remoteRoomInput.type = 'text';
    this.remoteRoomInput.inputMode = 'numeric';
    this.remoteRoomInput.maxLength = 4;
    this.remoteRoomInput.placeholder = '0000';
    this.remoteRoomInput.setAttribute('aria-label', 'Código de 4 dígitos mostrado na TV');
    roomLabel.appendChild(this.remoteRoomInput);

    const remoteGrid = this._doc.createElement('div');
    remoteGrid.className = 'form-grid';
    remoteGrid.append(serverLabel, roomLabel);

    this.remoteStatusEl = this._doc.createElement('div');
    this.remoteStatusEl.className = 'settings-row-label';

    const remoteActions = this._doc.createElement('div');
    remoteActions.className = 'form-row-actions';
    this.remoteConnectButtonEl = this._doc.createElement('button');
    this.remoteConnectButtonEl.type = 'button';
    this.remoteConnectButtonEl.className = 'btn btn-primary';
    this.remoteConnectButtonEl.innerHTML = `${icon('presentation')}<span>Conectar</span>`;
    this.remoteConnectButtonEl.addEventListener('click', () => {
      this._handlers.connectRemote.forEach((cb) => cb(this.remoteServerInput.value, this.remoteRoomInput.value));
    });
    this.remoteDisconnectButtonEl = this._doc.createElement('button');
    this.remoteDisconnectButtonEl.type = 'button';
    this.remoteDisconnectButtonEl.className = 'btn btn-quiet';
    this.remoteDisconnectButtonEl.innerHTML = `${icon('close')}<span>Desconectar</span>`;
    this.remoteDisconnectButtonEl.addEventListener('click', () => this._handlers.disconnectRemote.forEach((cb) => cb()));
    remoteActions.append(this.remoteConnectButtonEl, this.remoteDisconnectButtonEl);

    remoteSection.append(remoteGrid, this.remoteStatusEl, remoteActions);
    this.remoteSectionEl = remoteSection;

    // 3. Logo e identidade
    this.logoSectionEl = this._doc.createElement('section');
    this.logoSettings = new LogoSettings({ root: this.logoSectionEl });

    // 4. Playlist
    const playlistSection = this._doc.createElement('section');
    playlistSection.className = 'settings-section';
    playlistSection.innerHTML = '<div class="settings-section-title">Playlist</div>';
    this.clearPlaylistButtonEl = this._doc.createElement('button');
    this.clearPlaylistButtonEl.type = 'button';
    this.clearPlaylistButtonEl.className = 'btn btn-danger';
    this.clearPlaylistButtonEl.innerHTML = `${icon('delete')}<span>Limpar playlist</span>`;
    this.clearPlaylistButtonEl.addEventListener('click', () => this._handlers.clearPlaylist.forEach((cb) => cb()));
    playlistSection.appendChild(this.clearPlaylistButtonEl);

    // 5. Agendamento
    this.scheduleSectionEl = this._doc.createElement('section');
    this.scheduleSectionEl.className = 'settings-section';
    this.scheduleSectionEl.innerHTML = '<div class="settings-section-title">Agendamento</div><p style="color:var(--text-muted);font-size:var(--font-size-xs);margin:0">Funciona apenas com o aplicativo aberto — não há execução em segundo plano.</p>';
    this.rulesListEl = this._doc.createElement('div');
    this.addRuleButtonEl = this._doc.createElement('button');
    this.addRuleButtonEl.type = 'button';
    this.addRuleButtonEl.className = 'btn';
    this.addRuleButtonEl.innerHTML = `${icon('import')}<span>Adicionar regra</span>`;
    this.addRuleButtonEl.addEventListener('click', () => this._handlers.addRule.forEach((cb) => cb()));
    this.scheduleSectionEl.append(this.rulesListEl, this.addRuleButtonEl);

    // 6. Armazenamento
    this.storageSectionEl = this._doc.createElement('section');
    this.storageSectionEl.className = 'settings-section';
    this.storageSectionEl.innerHTML = '<div class="settings-section-title">Armazenamento</div>';
    this.storageInfoEl = this._doc.createElement('div');
    this.storageInfoEl.className = 'settings-row-label';
    this.storageSectionEl.appendChild(this.storageInfoEl);

    // 7. Sobre
    const about = this._doc.createElement('section');
    about.className = 'settings-section';
    about.innerHTML = '<div class="settings-section-title">Sobre</div><div class="settings-row-label">FBS Screen Manager — Mobile</div>';

    this._root.append(appearance, presentation, this.remoteSectionEl, this.logoSectionEl, playlistSection, this.scheduleSectionEl, this.storageSectionEl, about);
  }

  /** @param {import('../core/models.js').DEFAULT_SETTINGS} settings */
  render(settings = {}) {
    this.defaultDurationInput.value = String(settings.defaultDuration ?? 10);
    this.defaultTransitionSelect.value = settings.defaultTransition || '';
    this.defaultFitSelect.value = settings.defaultFit || 'contain';
    this._setSwitch(this._loopSwitchRow, !!settings.loopPlaylist);
    this._setSwitch(this._autoHideRow, settings.autoHideControls !== false);
    this.hideDelayInput.value = String(settings.hideControlsDelayMs ?? 3000);
    this._setSwitch(this._showNextRow, settings.showNextItem !== false);
    this._setSwitch(this._showTimerRow, settings.showTimer !== false);

    const remote = settings.remote || {};
    if (remote.serverUrl) this.remoteServerInput.value = remote.serverUrl;
    if (remote.room) this.remoteRoomInput.value = remote.room;
    this.renderRemoteStatus({ connected: !!remote.enabled });

    const logo = settings.logo || {};
    this.logoSettings.render({
      enabled: !!logo.enabled,
      previewSrc: logo._previewSrc || null,
      position: logo.position || 'bottom-right',
      size: logo.size ?? 20,
      opacity: logo.opacity ?? 100,
      margin: logo.margin ?? 16,
      keepAspect: logo.keepAspect !== false,
    });
  }

  _setSwitch(row, on) {
    const btn = row.querySelector('.switch');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', String(on));
  }

  renderRules(rules = []) {
    this.rulesListEl.innerHTML = '';
    rules.forEach((rule, index) => {
      const row = this._doc.createElement('div');
      row.className = 'rule-row';
      const start = this._doc.createElement('input');
      start.type = 'time';
      start.value = rule.start || '';
      start.setAttribute('aria-label', `Início da regra ${index + 1}`);
      start.addEventListener('change', () => this._handlers.updateRule.forEach((cb) => cb(index, 'start', start.value)));
      const end = this._doc.createElement('input');
      end.type = 'time';
      end.value = rule.end || '';
      end.setAttribute('aria-label', `Fim da regra ${index + 1}`);
      end.addEventListener('change', () => this._handlers.updateRule.forEach((cb) => cb(index, 'end', end.value)));
      const transition = this._doc.createElement('select');
      transition.setAttribute('aria-label', `Transição da regra ${index + 1}`);
      TRANSITIONS.forEach((t) => {
        const opt = this._doc.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (rule.transition === t) opt.selected = true;
        transition.appendChild(opt);
      });
      transition.addEventListener('change', () => this._handlers.updateRule.forEach((cb) => cb(index, 'transition', transition.value)));
      const removeBtn = this._doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-quiet';
      removeBtn.setAttribute('aria-label', `Remover regra ${index + 1}`);
      removeBtn.innerHTML = icon('delete');
      removeBtn.addEventListener('click', () => this._handlers.removeRule.forEach((cb) => cb(index)));
      row.append(start, end, transition, removeBtn);
      this.rulesListEl.appendChild(row);
    });
  }

  renderStorageInfo({ itemCount = 0, mode = 'web' } = {}) {
    this.storageInfoEl.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} na playlist · modo ${mode === 'native' ? 'nativo' : 'web (navegador)'}`;
  }

  renderRemoteStatus({ connected = false } = {}) {
    this.remoteStatusEl.textContent = connected ? 'Conectado à TV' : 'Desconectado';
    this.remoteConnectButtonEl.hidden = connected;
    this.remoteDisconnectButtonEl.hidden = !connected;
  }

  onChangeSettings(cb) { if (typeof cb === 'function') this._handlers.changeSettings.push(cb); }
  onClearPlaylist(cb) { if (typeof cb === 'function') this._handlers.clearPlaylist.push(cb); }
  onAddRule(cb) { if (typeof cb === 'function') this._handlers.addRule.push(cb); }
  onUpdateRule(cb) { if (typeof cb === 'function') this._handlers.updateRule.push(cb); }
  onRemoveRule(cb) { if (typeof cb === 'function') this._handlers.removeRule.push(cb); }
  onConnectRemote(cb) { if (typeof cb === 'function') this._handlers.connectRemote.push(cb); }
  onDisconnectRemote(cb) { if (typeof cb === 'function') this._handlers.disconnectRemote.push(cb); }
}
