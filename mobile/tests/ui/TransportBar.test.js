import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { TransportBar } from '../../www/app/ui/TransportBar.js';

function makeRoot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return dom.window.document.getElementById('root');
}

test('render(): reflete nome do item atual e estado play/pause (ícone SVG + aria-label, nunca emoji)', () => {
  const bar = new TransportBar({ root: makeRoot() });
  bar.render({ currentName: 'foto.png', isPlaying: true });
  assert.equal(bar.currentNameEl.textContent, 'foto.png');
  assert.equal(bar.playPauseButtonEl.getAttribute('aria-label'), 'Pausar');
  assert.ok(bar.playPauseButtonEl.querySelector('svg'));
  bar.render({ currentName: null, isPlaying: false });
  assert.equal(bar.currentNameEl.textContent, 'Nenhuma mídia');
  assert.equal(bar.playPauseButtonEl.getAttribute('aria-label'), 'Reproduzir');
  assert.ok(bar.playPauseButtonEl.querySelector('svg'));
});

test('nenhum botão usa emoji como ícone (apenas SVG)', () => {
  const bar = new TransportBar({ root: makeRoot() });
  for (const el of [bar.previousButtonEl, bar.playPauseButtonEl, bar.nextButtonEl, bar.blackoutButtonEl, bar.logoButtonEl]) {
    assert.ok(el.querySelector('svg'), 'botão deveria conter um <svg>');
    assert.doesNotMatch(el.textContent, /[\u{1F300}-\u{1FAFF}←-⇿⬀-⯿]/u, 'não deveria haver glifo/emoji como texto');
  }
});

test('onPlayPause/onNext/onPrevious/onBlackout/onLogo: cada botão dispara seu callback', () => {
  const bar = new TransportBar({ root: makeRoot() });
  const fired = new Set();
  bar.onPlayPause(() => fired.add('playPause'));
  bar.onNext(() => fired.add('next'));
  bar.onPrevious(() => fired.add('previous'));
  bar.onBlackout(() => fired.add('blackout'));
  bar.onLogo(() => fired.add('logo'));

  const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click'));
  click(bar.playPauseButtonEl);
  click(bar.nextButtonEl);
  click(bar.previousButtonEl);
  click(bar.blackoutButtonEl);
  click(bar.logoButtonEl);

  assert.deepEqual([...fired].sort(), ['blackout', 'logo', 'next', 'playPause', 'previous']);
});

test('todos os botões possuem aria-label (ícones sem texto)', () => {
  const bar = new TransportBar({ root: makeRoot() });
  for (const el of [bar.previousButtonEl, bar.playPauseButtonEl, bar.nextButtonEl, bar.blackoutButtonEl, bar.logoButtonEl]) {
    assert.ok(el.getAttribute('aria-label'));
  }
});

test('construtor exige um root DOM válido', () => {
  assert.throws(() => new TransportBar({ root: null }));
});
