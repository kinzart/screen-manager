// Casca do app v2 (Etapa 11): AppHeader + BottomNavigation (4 telas: Início,
// Playlist, Apresentação, Configurações) + apresentação fullscreen com
// overlay de controles com auto-hide. Substitui a casca anterior
// (editor/transporte/presenter sempre nas 3 mesmas divs) por navegação
// real, preservando a API pública que AppController já usa
// (editorView, transportBar, presenterView, showEditor(), showPresenter(),
// isPresenting()) — nenhuma mudança de contrato foi necessária em
// AppController para esta parte. Nunca importa Capacitor.

import { EditorView } from './EditorView.js';
import { TransportBar } from './TransportBar.js';
import { PresenterView } from './PresenterView.js';
import { AppHeader } from '../components/AppHeader.js';
import { BottomNavigation, NAV_ITEMS } from '../components/BottomNavigation.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { PresentationScreen } from '../screens/PresentationScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { StatusBanner } from '../components/StatusBanner.js';

const SCREEN_TITLES = {
  home: 'Início',
  playlist: 'Playlist',
  presentation: 'Apresentação',
  settings: 'Configurações',
};

const DEFAULT_HIDE_CONTROLS_DELAY_MS = 3000;

export class AppShell {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.root
   * @param {string} [deps.logoSrc]
   * @param {(message:string) => boolean} [deps.confirmFn]
   */
  constructor({ root, logoSrc = '', confirmFn } = {}) {
    if (!root || !root.ownerDocument) {
      throw new Error('AppShell: "root" deve ser um elemento DOM válido');
    }
    this._root = root;
    this._doc = root.ownerDocument;
    this._presenting = false;
    this._activeScreen = 'home';
    this._hideControlsDelayMs = DEFAULT_HIDE_CONTROLS_DELAY_MS;
    this._autoHideEnabled = true;
    this._hideTimer = null;
    this._buildDom();

    this.editorView = new EditorView({ root: this.playlistScreenEl, confirmFn });
    this.transportBar = new TransportBar({ root: this.transportRowEl });
    this.presenterView = new PresenterView({ root: this.presenterContainerEl, logoSrc });
    this.homeScreen = new HomeScreen({ root: this.homeScreenEl });
    this.presentationScreen = new PresentationScreen({ root: this.presentationIdleEl });
    this.settingsScreen = new SettingsScreen({ root: this.settingsScreenEl });

    this._wireNavigation();
    this._wireAutoHide();
    this.showEditor();
  }

  _createEl(tag, className) {
    const el = this._doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _buildDom() {
    this._root.innerHTML = '';
    this._root.classList.add('app-shell-v2');

    this.headerEl = this._createEl('header');
    this.header = new AppHeader({ root: this.headerEl });

    this.screensEl = this._createEl('div', 'app-shell-screens');

    this.homeScreenEl = this._createEl('section', 'app-screen');
    this.playlistScreenEl = this._createEl('section', 'app-screen playlist-screen-content');
    this.presentationScreenEl = this._createEl('section', 'app-screen');
    this.presentationIdleEl = this._createEl('div');
    this.presentationScreenEl.appendChild(this.presentationIdleEl);
    this.settingsScreenEl = this._createEl('section', 'app-screen');

    this.screensEl.append(this.homeScreenEl, this.playlistScreenEl, this.presentationScreenEl, this.settingsScreenEl);

    this.bottomNavEl = this._createEl('nav');
    this.bottomNavigation = new BottomNavigation({ root: this.bottomNavEl });

    // Fullscreen de apresentação — sobrepõe tudo quando isPresenting() é true.
    this.presenterContainerEl = this._createEl('div', 'app-screen-presentation-fullscreen');
    this.presenterContainerEl.hidden = true;

    this.controlsOverlayEl = this._createEl('div', 'presentation-controls-overlay');
    this.fullscreenTopBarEl = this._createEl('div', 'presentation-top-bar');
    this.fullscreenBottomBarEl = this._createEl('div', 'presentation-bottom-bar');
    // TransportBar precisa do seu PRÓPRIO container (.presentation-transport,
    // flex-row) — se ele recebesse fullscreenBottomBarEl diretamente como
    // root, a classe .transport-root (app.css) e .presentation-bottom-bar
    // (screens.css, flex-direction:column) colidiriam no MESMO elemento e
    // os botões empilhariam verticalmente em vez de ficar em linha (bug
    // real encontrado no QA visual — ver ETAPA_12_REPORT.md).
    this.transportRowEl = this._createEl('div', 'presentation-transport');
    this.fullscreenBottomBarEl.appendChild(this.transportRowEl);
    this.controlsOverlayEl.append(this.fullscreenTopBarEl, this.fullscreenBottomBarEl);

    // Toast global: independente de qual das 4 telas está ativa (e também
    // visível durante a apresentação fullscreen) — sem isto, um erro
    // reportado enquanto o usuário está em Início/Apresentação/
    // Configurações ficava só no banner da Playlist, invisível (bug real
    // encontrado nesta sessão: "clicar em Apresentar não fazia nada" tinha
    // um erro real acontecendo, mas nunca visível fora da tela Playlist).
    this.globalToastEl = this._createEl('div', 'global-toast');
    this.globalToast = new StatusBanner({ root: this.globalToastEl });

    this._root.append(this.headerEl, this.globalToastEl, this.screensEl, this.bottomNavEl, this.presenterContainerEl);
  }

  _wireNavigation() {
    this.bottomNavigation.onNavigate((screenId) => this.navigateTo(screenId));
    this.homeScreen.onEditPlaylist(() => this.navigateTo('playlist'));
  }

  _wireAutoHide() {
    const reveal = () => this._revealControls();
    this.presenterContainerEl.addEventListener('click', (e) => {
      if (e.target === this.presenterContainerEl || this.presenterView._root.contains(e.target)) reveal();
    });
    this.controlsOverlayEl.addEventListener('click', () => reveal());
  }

  _revealControls() {
    this.controlsOverlayEl.classList.remove('is-hidden');
    if (this._hideTimer) clearTimeout(this._hideTimer);
    if (this._autoHideEnabled) {
      this._hideTimer = setTimeout(() => this.controlsOverlayEl.classList.add('is-hidden'), this._hideControlsDelayMs);
    }
  }

  /** Configura comportamento de auto-hide dos controles durante a apresentação (vem de Settings). */
  setAutoHideControls(enabled, delayMs) {
    this._autoHideEnabled = enabled !== false;
    if (typeof delayMs === 'number' && delayMs > 0) this._hideControlsDelayMs = delayMs;
  }

  navigateTo(screenId) {
    if (this._presenting) return;
    this._activeScreen = screenId;
    this.bottomNavigation.setActive(screenId);
    this._applyScreenVisibility();
  }

  _applyScreenVisibility() {
    this.homeScreenEl.hidden = this._activeScreen !== 'home';
    this.playlistScreenEl.hidden = this._activeScreen !== 'playlist';
    this.presentationScreenEl.hidden = this._activeScreen !== 'presentation';
    this.settingsScreenEl.hidden = this._activeScreen !== 'settings';
    this.header.render({ title: SCREEN_TITLES[this._activeScreen] || '' });
  }

  showEditor() {
    this._presenting = false;
    this.presenterContainerEl.hidden = true;
    this.headerEl.hidden = false;
    this.bottomNavEl.hidden = false;
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this.controlsOverlayEl.classList.remove('is-hidden');
    this.navigateTo(this._activeScreen === 'settings' ? 'settings' : 'playlist');
  }

  showPresenter() {
    this._presenting = true;
    this.headerEl.hidden = true;
    this.bottomNavEl.hidden = true;
    this.presenterContainerEl.hidden = false;
    if (!this.presenterContainerEl.contains(this.controlsOverlayEl)) {
      this.presenterContainerEl.appendChild(this.controlsOverlayEl);
    }
    this._revealControls();
  }

  isPresenting() {
    return this._presenting;
  }
}

export { NAV_ITEMS };
