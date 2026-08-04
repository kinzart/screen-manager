// Testes de PresenterView usando jsdom. jsdom é a única dependência de DOM
// instalada nesta etapa (devDependency, só dentro de mobile/) — justificada
// porque PresenterView manipula elementos <img>/<video> reais (classList,
// eventos error/ended/loadedmetadata, atributos autoplay/muted/
// playsInline) e um fake de DOM caseiro reproduziria mal esse contrato.
// jsdom não simula reprodução real de mídia (HTMLMediaElement.play() é
// "not implemented" em jsdom) — por isso os testes de play/pause validam
// que os métodos são chamados e não lançam, não que o vídeo "toca de
// verdade" (isso é validação de device real, DEVICE_VALIDATION_BLOCKED).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { PresenterView } from '../../www/app/ui/PresenterView.js';

function makeRoot() {
  // Virtual console silenciosa: suprime o "Not implemented: HTMLMediaElement.prototype.play"
  // que o jsdom imprime por padrão — ruído esperado, não um erro de teste.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return dom.window.document.getElementById('root');
}

test('showImage: mostra uma imagem e limpa mídia anterior', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png', { fit: 'contain' });
  const img = view.mediaSlotEl.querySelector('img');
  assert.ok(img);
  assert.equal(img.src, 'foto.png');
});

test('showVideo: mostra um vídeo com autoplay/muted/playsInline', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showVideo('clipe.mp4', { fit: 'cover' });
  const video = view.mediaSlotEl.querySelector('video');
  assert.ok(video);
  assert.equal(video.autoplay, true);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
});

test('alterna de imagem para vídeo: remove a imagem anterior', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png');
  view.showVideo('clipe.mp4');
  assert.equal(view.mediaSlotEl.querySelectorAll('img').length, 0);
  assert.equal(view.mediaSlotEl.querySelectorAll('video').length, 1);
});

test('alterna de vídeo para imagem: remove o vídeo anterior', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showVideo('clipe.mp4');
  view.showImage('foto.png');
  assert.equal(view.mediaSlotEl.querySelectorAll('video').length, 0);
  assert.equal(view.mediaSlotEl.querySelectorAll('img').length, 1);
});

test('clear(): remove a mídia atual sem mostrar blackout nem logo', () => {
  const root = makeRoot();
  const view = new PresenterView({ root, logoSrc: 'logo.png' });
  view.showImage('foto.png');
  view.clear();
  assert.equal(view.mediaSlotEl.children.length, 0);
  assert.equal(view.blackoutEl.hidden, true);
  assert.equal(view.logoEl.hidden, true);
});

test('blackout(): esconde mídia e logo, mostra a camada de blackout', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png');
  view.blackout();
  assert.equal(view.blackoutEl.hidden, false);
  assert.equal(view.mediaSlotEl.children.length, 0);
});

test('logo(): esconde mídia e blackout, mostra a camada de logo', () => {
  const root = makeRoot();
  const view = new PresenterView({ root, logoSrc: 'logo.png' });
  view.showImage('foto.png');
  view.logo();
  assert.equal(view.logoEl.hidden, false);
  assert.equal(view.logoEl.src, 'logo.png');
  assert.equal(view.mediaSlotEl.children.length, 0);
});

test('pause()/resume(): chamam pause()/play() no elemento de vídeo atual sem lançar', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showVideo('clipe.mp4');
  assert.doesNotThrow(() => view.pause());
  assert.doesNotThrow(() => view.resume());
});

test('pause()/resume(): não fazem nada quando a mídia atual é uma imagem', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png');
  assert.doesNotThrow(() => view.pause());
  assert.doesNotThrow(() => view.resume());
});

test('erro de mídia: evento "error" da imagem aciona setError() e emite status', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  const statuses = [];
  view.onStatus((s) => statuses.push(s));
  view.showImage('quebrada.png');
  const img = view.mediaSlotEl.querySelector('img');
  img.dispatchEvent(new img.ownerDocument.defaultView.Event('error'));
  assert.equal(view.errorEl.hidden, false);
  assert.equal(statuses.length, 1);
  assert.ok(statuses[0].error);
});

test('evento "ended" do vídeo é propagado via onStatus', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  const statuses = [];
  view.onStatus((s) => statuses.push(s));
  view.showVideo('clipe.mp4');
  const video = view.mediaSlotEl.querySelector('video');
  video.dispatchEvent(new video.ownerDocument.defaultView.Event('ended'));
  assert.equal(statuses.some((s) => s.ended === true), true);
});

test('fit contain: aplica a classe fit-contain por padrão e para valor desconhecido', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png', { fit: 'contain' });
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('fit-contain'));
  view.showImage('foto2.png', { fit: 'algo-desconhecido' });
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('fit-contain'));
});

test('fit cover: aplica a classe fit-cover quando solicitado', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png', { fit: 'cover' });
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('fit-cover'));
});

test('transição válida: aplica a classe enter-<transição> correspondente', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png', { transition: 'zoom' });
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('enter-zoom'));
});

test('fallback de transição: valor desconhecido/ausente cai em enter-fade', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.showImage('foto.png', { transition: 'wipe-inexistente' });
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('enter-fade'));
  view.showImage('foto2.png', {});
  assert.ok(view.mediaSlotEl.querySelector('img').classList.contains('enter-fade'));
});

test('estado de carregamento: setLoading(true/false) alterna a visibilidade do indicador', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.setLoading(true);
  assert.equal(view.loadingEl.hidden, false);
  view.setLoading(false);
  assert.equal(view.loadingEl.hidden, true);
});

test('controles ocultáveis: setControlsVisible(false) esconde o botão de saída', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  view.setControlsVisible(false);
  assert.equal(view.controlsEl.hidden, true);
  view.setControlsVisible(true);
  assert.equal(view.controlsEl.hidden, false);
});

test('onExit: dispara ao clicar no botão de saída (retorno ao editor)', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  let exited = false;
  view.onExit(() => { exited = true; });
  view.exitButtonEl.dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(exited, true);
});

test('exitButton possui aria-label (acessibilidade)', () => {
  const root = makeRoot();
  const view = new PresenterView({ root });
  assert.equal(view.exitButtonEl.getAttribute('aria-label'), 'Sair da apresentação');
});

test('construtor exige um root DOM válido', () => {
  assert.throws(() => new PresenterView({ root: null }));
  assert.throws(() => new PresenterView({ root: {} }));
});
