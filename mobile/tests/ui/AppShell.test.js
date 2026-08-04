import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { AppShell } from '../../www/app/ui/AppShell.js';
import { EditorView } from '../../www/app/ui/EditorView.js';
import { TransportBar } from '../../www/app/ui/TransportBar.js';
import { PresenterView } from '../../www/app/ui/PresenterView.js';

function makeRoot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return dom.window.document.getElementById('root');
}

test('compõe EditorView, TransportBar e PresenterView, além das telas novas (Etapa 11)', () => {
  const shell = new AppShell({ root: makeRoot() });
  assert.ok(shell.editorView instanceof EditorView);
  assert.ok(shell.transportBar instanceof TransportBar);
  assert.ok(shell.presenterView instanceof PresenterView);
  assert.ok(shell.homeScreen);
  assert.ok(shell.presentationScreen);
  assert.ok(shell.settingsScreen);
  assert.ok(shell.header);
  assert.ok(shell.bottomNavigation);
});

test('mostra a Playlist por padrão após showEditor(), com header/bottom-nav visíveis e presenter escondido', () => {
  const shell = new AppShell({ root: makeRoot() });
  assert.equal(shell.isPresenting(), false);
  assert.equal(shell.playlistScreenEl.hidden, false);
  assert.equal(shell.presenterContainerEl.hidden, true);
  assert.equal(shell.headerEl.hidden, false);
  assert.equal(shell.bottomNavEl.hidden, false);
});

test('showPresenter()/showEditor(): alternam entre fullscreen (sem header/bottom-nav) e a navegação normal', () => {
  const shell = new AppShell({ root: makeRoot() });
  shell.showPresenter();
  assert.equal(shell.isPresenting(), true);
  assert.equal(shell.presenterContainerEl.hidden, false);
  assert.equal(shell.headerEl.hidden, true);
  assert.equal(shell.bottomNavEl.hidden, true);

  shell.showEditor();
  assert.equal(shell.isPresenting(), false);
  assert.equal(shell.presenterContainerEl.hidden, true);
  assert.equal(shell.headerEl.hidden, false);
  assert.equal(shell.bottomNavEl.hidden, false);
  assert.equal(shell.playlistScreenEl.hidden, false);
});

test('navigateTo(): alterna qual das 4 telas fica visível e atualiza o título do header', () => {
  const shell = new AppShell({ root: makeRoot() });
  shell.navigateTo('home');
  assert.equal(shell.homeScreenEl.hidden, false);
  assert.equal(shell.playlistScreenEl.hidden, true);
  assert.match(shell.header.titleEl.textContent, /Início/);

  shell.navigateTo('settings');
  assert.equal(shell.settingsScreenEl.hidden, false);
  assert.equal(shell.homeScreenEl.hidden, true);
  assert.match(shell.header.titleEl.textContent, /Configurações/);
});

test('navigateTo() é ignorado durante a apresentação (fullscreen tem prioridade)', () => {
  const shell = new AppShell({ root: makeRoot() });
  shell.showPresenter();
  shell.navigateTo('settings');
  assert.equal(shell.isPresenting(), true);
  assert.equal(shell.settingsScreenEl.hidden, true); // não mudou, pois estava presenting
});

test('bottom navigation reflete a navegação e nunca fica visível durante apresentação', () => {
  const shell = new AppShell({ root: makeRoot() });
  const playlistBtn = [...shell.bottomNavEl.querySelectorAll('.bottom-nav-item')][1];
  playlistBtn.dispatchEvent(new shell._doc.defaultView.Event('click'));
  assert.equal(shell.bottomNavigation.active, 'playlist');
  shell.showPresenter();
  assert.equal(shell.bottomNavEl.hidden, true);
});

test('showPresenter(): TransportBar (controles de blackout/logo/play/pause/próximo/anterior) fica dentro do overlay da apresentação, nunca escondido', () => {
  const shell = new AppShell({ root: makeRoot() });
  shell.showPresenter();
  assert.equal(shell.fullscreenBottomBarEl.hidden, false);
  assert.ok(shell.presenterContainerEl.contains(shell.fullscreenBottomBarEl));
  assert.ok(shell.presenterContainerEl.contains(shell.transportBar._root));
});

test('setAutoHideControls(): controla se o overlay reaparece/permanece após revelar', () => {
  const shell = new AppShell({ root: makeRoot() });
  shell.setAutoHideControls(false);
  shell.showPresenter();
  assert.equal(shell.controlsOverlayEl.classList.contains('is-hidden'), false);
});

test('construtor exige um root DOM válido', () => {
  assert.throws(() => new AppShell({ root: null }));
});
