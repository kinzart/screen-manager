// Orquestrador da aplicação mobile: conecta o core (PlaylistManager,
// PlaybackEngine, ScheduleEngine), os adapters (StoragePort, MediaPort,
// PresentationAdapter) e a UI (AppShell: EditorView, TransportBar,
// PresenterView). A UI nunca importa Capacitor nem fala com os adapters
// diretamente — tudo passa por aqui, evitando dependência circular.
//
// Fluxo inicial (init): carregar settings → carregar playlist → carregar
// RuntimeState → restaurar estado compatível → renderizar editor.
//
// Agendamento (startAt/rules): expõe os campos e o motor (ScheduleEngine),
// mas NÃO cria nenhum serviço em background Android. O agendamento só
// funciona enquanto o app está aberto e ativo — isso deve ficar claro na
// interface/documentação, não é simulado nem prometido além disso aqui.

import { PlaylistManager } from './core/PlaylistManager.js';
import { PlaybackEngine } from './core/PlaybackEngine.js';
import { ScheduleEngine } from './core/ScheduleEngine.js';
import { generateId, DEFAULT_LOGO_SETTINGS, DEFAULT_REMOTE_SETTINGS, displayNameFor } from './core/models.js';
import { RemoteDesktopAdapter } from './adapters/RemoteDesktopAdapter.js';

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[AppController]', JSON.stringify(payload));
    } catch {
      console.warn('[AppController]', payload);
    }
  },
};

const DEFAULT_SETTINGS = Object.freeze({
  rules: [],
  defaultFit: 'contain',
  loopPlaylist: true,
  defaultDuration: 10,
  defaultTransition: '',
  autoHideControls: true,
  hideControlsDelayMs: 3000,
  showNextItem: true,
  showTimer: true,
  logo: DEFAULT_LOGO_SETTINGS,
  remote: DEFAULT_REMOTE_SETTINGS,
});

export class AppController {
  /**
   * @param {object} deps
   * @param {import('./core/ports.js').StoragePort} deps.storage
   * @param {import('./core/ports.js').MediaPort} deps.media
   * @param {import('./core/ports.js').PresentationAdapter} deps.presentation
   * @param {import('./ui/AppShell.js').AppShell} deps.shell
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   * @param {() => number} [deps.now]
   * @param {(fn:Function, ms:number) => any} [deps.scheduleDebounce] - default: setTimeout.
   * @param {(handle:any) => void} [deps.cancelDebounce] - default: clearTimeout.
   * @param {number} [deps.debounceMs]
   * @param {PlaylistManager} [deps.playlistManager] - default: nova instância própria.
   * @param {PlaybackEngine} [deps.playbackEngine] - default: nova instância própria.
   * @param {ScheduleEngine} [deps.scheduleEngine] - default: nova instância própria.
   */
  constructor({
    storage, media, presentation, shell, logger, now, scheduleDebounce, cancelDebounce, debounceMs = 500,
    playlistManager, playbackEngine, scheduleEngine, confirmFn,
  } = {}) {
    if (!storage) throw new Error('AppController: "storage" é obrigatório');
    if (!media) throw new Error('AppController: "media" é obrigatório');
    if (!presentation) throw new Error('AppController: "presentation" é obrigatório');
    if (!shell) throw new Error('AppController: "shell" é obrigatório');

    this._storage = storage;
    this._media = media;
    this._localPresentation = presentation; // fallback ao desativar o controle remoto
    this._presentation = presentation;
    this._shell = shell;
    this._logger = logger || DEFAULT_LOGGER;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._scheduleDebounce = typeof scheduleDebounce === 'function' ? scheduleDebounce : (fn, ms) => setTimeout(fn, ms);
    this._cancelDebounce = typeof cancelDebounce === 'function' ? cancelDebounce : (handle) => clearTimeout(handle);
    this._debounceMs = debounceMs;
    this._saveTimer = null;
    this._saveCount = 0; // exposto para testes de "autosave sem excesso de escritas"
    this._confirmFn = typeof confirmFn === 'function' ? confirmFn : () => true;
    this._thumbCache = new Map(); // id -> { status: 'ready'|'unavailable', src? }
    this._logoPreviewSrc = null;

    this._playlist = playlistManager || new PlaylistManager();
    this._settings = { ...DEFAULT_SETTINGS };
    this._playback = playbackEngine || new PlaybackEngine({ now: this._now });
    this._schedule = scheduleEngine || new ScheduleEngine([]);

    this._wireViewEvents();
    this._wireScreenEvents();
    this._localPresentation.onStatus((status) => this._onPresentationStatus(status));
  }

  get saveCount() {
    return this._saveCount;
  }

  isPresenting() {
    return this._playback.presenting;
  }

  /** Cancela o debounce pendente (se houver) e grava imediatamente. Usado ao ir para background. */
  async flushPendingSave() {
    if (this._saveTimer) {
      this._cancelDebounce(this._saveTimer);
      this._saveTimer = null;
    }
    await this._flushSave();
  }

  /** Alias público de _saveRuntimeStateNow, para uso pelo LifecycleCoordinator. */
  async saveRuntimeStateNow() {
    return this._saveRuntimeStateNow();
  }

  /**
   * Chamado ao retornar do background (LifecycleCoordinator). Recalcula o
   * estado de reprodução a partir do timestamp real decorrido (nunca soma
   * ticks perdidos) via PlaybackEngine.tick, reage a autoavanço/expiração,
   * e trata o caso de a mídia atual ter sido removida da playlist enquanto
   * o app estava em segundo plano.
   */
  async resumeFromBackground(now = this._now()) {
    if (!this._playback.presenting) {
      this._renderTransport();
      return { action: 'idle' };
    }
    const playlist = this._playlist.list();
    const result = this._playback.tick(playlist, this._settings, now);
    if (result.action === 'advanced') {
      const current = this._playlist.findById(this._playback.currentId);
      if (current) await this._presentation.show(current);
    } else if (result.action === 'stopped') {
      if (result.reason === 'item-missing') {
        this._reportUserError('A mídia em reprodução foi removida ou não está mais disponível.');
      }
      await this._presentation.clear();
      this._shell.showEditor();
    }
    this._renderEditor();
    await this._saveRuntimeStateNow();
    return result;
  }

  async init() {
    try {
      const loaded = await this._storage.loadSettings();
      // Mescla com defaults: Settings persistidos antes desta etapa não têm
      // os campos novos (logo, autoHideControls, etc.) — nunca tratamos
      // ausência como erro, só completamos com o padrão.
      this._settings = {
        ...DEFAULT_SETTINGS,
        ...loaded,
        logo: { ...DEFAULT_LOGO_SETTINGS, ...(loaded?.logo || {}) },
        remote: { ...DEFAULT_REMOTE_SETTINGS, ...(loaded?.remote || {}) },
      };
    } catch (error) {
      this._settings = { ...DEFAULT_SETTINGS };
      this._reportPersistenceError('Falha ao carregar configurações', error);
    }
    this._schedule.setRules(this._settings.rules);
    this._shell.setAutoHideControls?.(this._settings.autoHideControls, this._settings.hideControlsDelayMs);

    try {
      const items = await this._storage.loadPlaylist();
      this._playlist.replace(items);
    } catch (error) {
      this._reportPersistenceError('Falha ao carregar playlist', error);
    }

    let runtimeState = null;
    try {
      runtimeState = await this._storage.loadRuntimeState();
    } catch (error) {
      this._reportPersistenceError('Falha ao restaurar estado', error);
    }
    if (runtimeState) {
      this._playback.restore(runtimeState, this._playlist.list(), this._now());
    }

    this._renderEditor();
    this._renderHome();
    this._renderPresentationIdle();
    this._renderSettingsScreen();
    await this._applyLogoToPresenter();
    if (this._settings.remote?.enabled && this._settings.remote.serverUrl && this._settings.remote.room) {
      this._connectRemotePresentation(this._settings.remote.serverUrl, this._settings.remote.room, this._settings.remote.token);
    }
    this._shell.showEditor();
  }

  _wireViewEvents() {
    const editor = this._shell.editorView;
    const transport = this._shell.transportBar;

    editor.onImportClick(() => this.importMedia());
    editor.onRemove((id) => this.removeFromPlaylist(id));
    editor.onMoveUp((id) => this.moveItem(id, -1));
    editor.onMoveDown((id) => this.moveItem(id, 1));
    editor.onEditField((id, field, value) => this.editItem(id, field, value));
    editor.onToggleLoop(() => this.toggleLoop());
    editor.onSelectItem((id) => this.startPresentation(id));
    editor.onReselectMedia?.((id) => this.reselectMedia(id));

    transport.onPlayPause(() => this.togglePlayback());
    transport.onNext(() => this.next());
    transport.onPrevious(() => this.previous());
    transport.onBlackout(() => this.blackout());
    transport.onLogo(() => this.logo());

    this._shell.presenterView.onExit(() => this.exitPresentation());
  }

  /** Conecta as telas novas (Início/Apresentação-parado/Configurações) — nenhuma delas é obrigatória (fallback opcional via `?.`) para não quebrar shells de teste mínimos. */
  _wireScreenEvents() {
    const home = this._shell.homeScreen;
    home?.onPresent(() => this.startPresentation());
    home?.onImportClick(() => this.importMedia());

    const presentationIdle = this._shell.presentationScreen;
    presentationIdle?.onPresent(() => this.startPresentation());

    const settings = this._shell.settingsScreen;
    settings?.onChangeSettings((patch) => this.updateSettings(patch));
    settings?.onClearPlaylist(() => this.clearPlaylist());
    settings?.onAddRule(() => this.addScheduleRule());
    settings?.onUpdateRule((index, field, value) => this.updateScheduleRule(index, field, value));
    settings?.onRemoveRule((index) => this.removeScheduleRule(index));
    settings?.logoSettings?.onImportClick(() => this.importLogo());
    settings?.logoSettings?.onRemoveClick(() => this.removeLogo());
    settings?.logoSettings?.onChange((patch) => this.updateLogoSettings(patch));
    settings?.onConnectRemote((serverUrl, room) => this.connectRemote(serverUrl, room));
    settings?.onDisconnectRemote(() => this.disconnectRemote());
  }

  _renderEditor() {
    const items = this._playlist.list();
    this._shell.editorView.render(items, this._settings, { currentId: this._playback.currentId, thumbnails: this._thumbCache });
    this._renderTransport();
    this._resolveThumbnails(items);
  }

  _renderTransport() {
    const current = this._playback.currentId ? this._playlist.findById(this._playback.currentId) : null;
    this._shell.transportBar.render({
      currentName: current ? displayNameFor(current) : null,
      isPlaying: this._playback.running && !this._playback.paused,
    });
  }

  /** Resolve miniaturas ainda não resolvidas (fire-and-forget); re-renderiza só quando algo novo foi resolvido. */
  async _resolveThumbnails(items) {
    const pending = items.filter((item) => !this._thumbCache.has(item.id));
    if (!pending.length) return;
    let changed = false;
    await Promise.all(pending.map(async (item) => {
      try {
        const src = await this._media.resolveSrc(item.media);
        this._thumbCache.set(item.id, { status: 'ready', src });
      } catch {
        this._thumbCache.set(item.id, { status: 'unavailable' });
      }
      changed = true;
    }));
    if (changed) {
      this._shell.editorView.render(this._playlist.list(), this._settings, { currentId: this._playback.currentId, thumbnails: this._thumbCache });
    }
  }

  _renderHome() {
    const items = this._playlist.list();
    const totalDurationSec = items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    const current = this._playback.currentId ? this._playlist.findById(this._playback.currentId) : null;
    this._shell.homeScreen?.render({
      itemCount: items.length,
      totalDurationSec,
      currentName: current ? displayNameFor(current) : null,
      isPresenting: this._playback.presenting,
    });
  }

  _renderPresentationIdle() {
    const items = this._playlist.list();
    const current = this._playback.currentId ? this._playlist.findById(this._playback.currentId) : null;
    const i = current ? items.findIndex((x) => x.id === current.id) : -1;
    const nextItem = current
      ? (i < items.length - 1 ? items[i + 1] : (this._settings.loopPlaylist && items.length > 1 ? items[0] : null))
      : items[0] || null;
    this._shell.presentationScreen?.render({ currentItem: current, nextItem, hasItems: items.length > 0 });
  }

  _renderSettingsScreen() {
    this._shell.settingsScreen?.render({ ...this._settings, logo: { ...this._settings.logo, _previewSrc: this._logoPreviewSrc } });
    this._shell.settingsScreen?.renderRules(this._settings.rules);
    this._shell.settingsScreen?.renderStorageInfo({ itemCount: this._playlist.length, mode: this._media.constructor?.name === 'WebMediaAdapter' ? 'web' : 'native' });
  }

  /** Autosave com debounce: várias edições seguidas geram uma única escrita. */
  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = this._scheduleDebounce(() => {
      this._saveTimer = null;
      this._flushSave();
    }, this._debounceMs);
  }

  async _flushSave() {
    this._saveCount += 1;
    try {
      await this._storage.savePlaylist(this._playlist.list());
      await this._storage.saveSettings(this._settings);
    } catch (error) {
      this._reportPersistenceError('Falha ao salvar', error);
    }
  }

  async _saveRuntimeStateNow() {
    try {
      await this._storage.saveRuntimeState(this._playback.snapshot(this._now()));
    } catch (error) {
      this._reportPersistenceError('Falha ao salvar estado', error);
    }
  }

  _reportPersistenceError(message, error) {
    const full = `${message}: ${String(error?.message || error)}`;
    this._logger.warn({ event: 'app.persistence-error', error: full });
    this._reportUserError(full);
  }

  /**
   * Reporta um erro ao usuário de forma que seja visível INDEPENDENTE de
   * qual tela está ativa — envia tanto ao banner da Playlist (histórico,
   * fica visível ao voltar pra lá) quanto a um toast global fixo (visível
   * em Início/Apresentação/Configurações e até durante a apresentação
   * fullscreen). Antes desta correção, erros só apareciam no banner da
   * Playlist — invisíveis se o usuário estivesse em outra tela (bug real:
   * ver "startPresentation" e o caso de currentId obsoleto).
   */
  _reportUserError(message) {
    this._shell.editorView.showError(message);
    this._shell.globalToast?.render({ kind: 'error', message, autoDismissMs: 6000 });
  }

  _onPresentationStatus(status) {
    if (status?.error) {
      this._reportUserError(status.error);
    }
  }

  // --- importação ---

  async importMedia() {
    this._shell.editorView.showFeedback('Selecionando mídia…');
    let picked;
    try {
      picked = await this._media.pickMedia();
    } catch (error) {
      this._shell.editorView.showFeedback('');
      this._reportUserError(`Erro ao selecionar mídia: ${String(error?.message || error)}`);
      return;
    }
    if (!picked.length) {
      this._shell.editorView.showFeedback('Importação cancelada');
      return;
    }
    let importedCount = 0;
    for (const file of picked) {
      try {
        const mediaRef = await this._media.importToLibrary(file);
        this._playlist.add({
          id: generateId(),
          media: mediaRef,
          name: file.name,
          type: mediaRef.mime.startsWith('video/') ? 'video' : 'image',
          duration: 10,
          transition: '',
          fit: this._settings.defaultFit || 'contain',
          startAt: '',
        });
        importedCount += 1;
      } catch (error) {
        this._reportUserError(`Erro ao importar "${file.name}": ${String(error?.message || error)}`);
      }
    }
    if (importedCount > 0) {
      this._shell.editorView.showFeedback(`${importedCount} arquivo(s) importado(s)`);
      this._renderEditor();
      this._renderHome();
      this._renderPresentationIdle();
      this.scheduleSave();
    }
  }

  /** Troca a mídia de um item cuja mídia web ficou indisponível após reload (ver WebMediaAdapter). Metadados preservados. */
  async reselectMedia(id) {
    const item = this._playlist.findById(id);
    if (!item) return;
    let picked;
    try {
      picked = await this._media.pickMedia();
    } catch (error) {
      this._reportUserError(`Erro ao selecionar mídia: ${String(error?.message || error)}`);
      return;
    }
    if (!picked.length) return;
    try {
      const mediaRef = await this._media.importToLibrary(picked[0]);
      this._thumbCache.delete(id);
      this._playlist.update(id, { media: mediaRef, type: mediaRef.mime.startsWith('video/') ? 'video' : 'image' });
      this._renderEditor();
      this.scheduleSave();
    } catch (error) {
      this._reportUserError(`Erro ao importar "${picked[0]?.name}": ${String(error?.message || error)}`);
    }
  }

  // --- playlist ---

  removeFromPlaylist(id) {
    const wasCurrent = this._playback.currentId === id;
    this._playlist.remove(id);
    this._thumbCache.delete(id);
    if (wasCurrent) this._playback.stop();
    this._renderEditor();
    this._renderHome();
    this._renderPresentationIdle();
    this.scheduleSave();
  }

  /** Remove todos os itens da playlist, com confirmação (chamado pela tela de Configurações). */
  async clearPlaylist() {
    const confirmed = await this._confirmFn('Remover todos os itens da playlist?');
    if (!confirmed) return;
    this._playlist.replace([]);
    this._thumbCache.clear();
    this._playback.stop();
    this._renderEditor();
    this._renderHome();
    this._renderPresentationIdle();
    this.scheduleSave();
  }

  moveItem(id, delta) {
    this._playlist.moveBy(id, delta);
    this._renderEditor();
    this.scheduleSave();
  }

  editItem(id, field, value) {
    this._playlist.update(id, { [field]: value });
    this._renderEditor();
    this._renderHome();
    this.scheduleSave();
  }

  toggleLoop() {
    this._settings = { ...this._settings, loopPlaylist: !this._settings.loopPlaylist };
    this._renderEditor();
    this._renderPresentationIdle();
    this.scheduleSave();
  }

  /** Aplica um patch parcial de Settings (vindo da tela de Configurações), valida e persiste. */
  async updateSettings(patch) {
    this._settings = { ...this._settings, ...patch };
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'autoHideControls')) {
      this._shell.setAutoHideControls?.(this._settings.autoHideControls, this._settings.hideControlsDelayMs);
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'hideControlsDelayMs')) {
      this._shell.setAutoHideControls?.(this._settings.autoHideControls, this._settings.hideControlsDelayMs);
    }
    this._renderEditor();
    this._renderSettingsScreen();
    await this._flushSave();
  }

  // --- logo / identidade ---

  async importLogo() {
    let picked;
    try {
      picked = await this._media.pickMedia();
    } catch (error) {
      this._logger.warn({ event: 'logo.pick-failed', error: String(error?.message || error) });
      return;
    }
    if (!picked.length) return;
    try {
      const mediaRef = await this._media.importToLibrary(picked[0]);
      await this.updateLogoSettings({ media: mediaRef, enabled: true });
    } catch (error) {
      this._logger.warn({ event: 'logo.import-failed', error: String(error?.message || error) });
    }
  }

  async removeLogo() {
    await this.updateLogoSettings({ media: null, enabled: false });
  }

  /** Patch parcial de Settings.logo — persiste e reaplica a marca d'água no presenter. */
  async updateLogoSettings(patch) {
    this._settings = { ...this._settings, logo: { ...this._settings.logo, ...patch } };
    await this._applyLogoToPresenter();
    this._renderSettingsScreen();
    await this._flushSave();
  }

  /** Resolve o MediaRef do logo (quando existir) e aplica a marca d'água persistente no PresenterView. */
  async _applyLogoToPresenter() {
    const logo = this._settings.logo || {};
    this._logoPreviewSrc = null;
    if (logo.media) {
      try {
        this._logoPreviewSrc = await this._media.resolveSrc(logo.media);
      } catch (error) {
        this._logger.warn({ event: 'logo.resolve-failed', error: String(error?.message || error) });
      }
    }
    this._shell.presenterView?.setWatermark?.({
      enabled: !!logo.enabled && !!this._logoPreviewSrc,
      src: this._logoPreviewSrc,
      position: logo.position,
      size: logo.size,
      opacity: logo.opacity,
      margin: logo.margin,
      keepAspect: logo.keepAspect,
    });
  }

  // --- controle remoto (TV via servidor de retransmissão) ---

  /** Troca a apresentação ativa para a TV remota (mesma interface PresentationAdapter). */
  _connectRemotePresentation(serverUrl, room, token = '') {
    if (this._presentation instanceof RemoteDesktopAdapter) this._presentation.disconnect();
    const remote = new RemoteDesktopAdapter({ serverUrl, room, token, media: this._media, logger: this._logger });
    remote.onStatus((status) => this._onPresentationStatus(status));
    this._presentation = remote;
  }

  /**
   * Conecta ao controle remoto (chamado pela tela de Configurações com o
   * código de 4 dígitos mostrado na TV). Persiste a escolha — reconecta
   * automaticamente na próxima abertura do app enquanto estiver ativado.
   */
  async connectRemote(serverUrl, room, token = '') {
    const cleanServerUrl = String(serverUrl || '').trim().replace(/\/$/, '');
    const cleanRoom = String(room || '').trim();
    if (!cleanServerUrl || !cleanRoom) {
      this._reportUserError('Informe o endereço do servidor e o código da TV.');
      return;
    }
    const cleanToken = String(token || '').trim();
    this._connectRemotePresentation(cleanServerUrl, cleanRoom, cleanToken);
    this._settings = { ...this._settings, remote: { enabled: true, serverUrl: cleanServerUrl, room: cleanRoom, token: cleanToken } };
    this._renderSettingsScreen();
    await this._flushSave();
  }

  /** Volta a apresentar na tela do próprio celular (LocalPresentationAdapter). */
  async disconnectRemote() {
    if (this._presentation instanceof RemoteDesktopAdapter) this._presentation.disconnect();
    this._presentation = this._localPresentation;
    this._settings = { ...this._settings, remote: { ...this._settings.remote, enabled: false } };
    this._renderSettingsScreen();
    await this._flushSave();
  }

  isRemoteConnected() {
    return this._presentation instanceof RemoteDesktopAdapter;
  }

  // --- agendamento ---

  addScheduleRule() {
    this._settings = { ...this._settings, rules: [...this._settings.rules, { start: '19:00', end: '20:00', transition: 'fade' }] };
    this._schedule.setRules(this._settings.rules);
    this._renderSettingsScreen();
    this.scheduleSave();
  }

  updateScheduleRule(index, field, value) {
    const rules = this._settings.rules.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    this._settings = { ...this._settings, rules };
    this._schedule.setRules(rules);
    this.scheduleSave();
  }

  removeScheduleRule(index) {
    const rules = this._settings.rules.filter((_, i) => i !== index);
    this._settings = { ...this._settings, rules };
    this._schedule.setRules(rules);
    this._renderSettingsScreen();
    this.scheduleSave();
  }

  // --- apresentação ---
  // v1 local-only: apresenta na tela do próprio celular via
  // LocalPresentationAdapter. Controle remoto do Electron (Opção C/futuro)
  // não é implementado aqui.

  async startPresentation(id) {
    const playlist = this._playlist.list();
    if (!playlist.length) return;
    // "currentId" pode ser um resquício de uma sessão anterior (item já
    // removido da playlist desde então — ex.: RuntimeState restaurado ou
    // troca de dispositivo). Nunca confiar nele cegamente: PlaybackEngine
    // .take() lança se o id não existir mais, e isso acontece ANTES de
    // showPresenter() — sem este fallback, a tela simplesmente não muda
    // (a promise rejeita em silêncio), exatamente como "clicar em
    // Apresentar e não acontecer nada". Bug real encontrado nesta sessão.
    const requestedId = id || this._playback.currentId;
    const targetId = requestedId && playlist.some((x) => x.id === requestedId) ? requestedId : playlist[0].id;
    let item;
    try {
      item = this._playback.take(targetId, playlist, this._now());
      this._shell.showPresenter();
      await this._presentation.show(item);
    } catch (error) {
      const message = `Não foi possível iniciar a apresentação: ${String(error?.message || error)}`;
      this._logger.warn({ event: 'app.start-presentation-failed', error: message });
      this._reportUserError(message);
      return;
    }
    this._renderTransport();
    this._renderHome();
    this._renderPresentationIdle();
    await this._saveRuntimeStateNow();
  }

  async exitPresentation() {
    await this._presentation.clear();
    this._shell.showEditor();
    this._renderEditor();
    this._renderHome();
    this._renderPresentationIdle();
    await this._saveRuntimeStateNow();
  }

  async togglePlayback() {
    if (!this._playback.running) {
      await this.startPresentation();
      return;
    }
    const action = this._playback.toggle(this._now());
    if (action === 'paused') await this._presentation.pause();
    else if (action === 'resumed') await this._presentation.resume();
    this._renderTransport();
    await this._saveRuntimeStateNow();
  }

  async next() {
    const playlist = this._playlist.list();
    if (!playlist.length) return;
    const item = this._playback.next(playlist, 1, this._now());
    await this._presentation.show(item);
    this._renderTransport();
    this._renderHome();
    this._renderPresentationIdle();
    await this._saveRuntimeStateNow();
  }

  async previous() {
    const playlist = this._playlist.list();
    if (!playlist.length) return;
    const item = this._playback.previous(playlist, this._now());
    await this._presentation.show(item);
    this._renderTransport();
    this._renderHome();
    this._renderPresentationIdle();
    await this._saveRuntimeStateNow();
  }

  async blackout() {
    this._playback.blackout = true;
    await this._presentation.blackout();
    await this._saveRuntimeStateNow();
  }

  async logo() {
    this._playback.blackout = false;
    await this._presentation.logo();
    await this._saveRuntimeStateNow();
  }
}
