import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { EditorView } from '../../www/app/ui/EditorView.js';

function makeRoot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return dom.window.document.getElementById('root');
}

function makeItem(id, overrides = {}) {
  return {
    id,
    media: { storage: 'sandbox', relPath: `library/${id}.jpg`, mime: 'image/jpeg', bytes: 10 },
    name: `${id}.jpg`,
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

test('render(): lista vazia mostra o estado vazio', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([], { loopPlaylist: true });
  assert.equal(view.emptyStateEl.hidden, false);
  assert.equal(view.listEl.children.length, 0);
});

test('render(): lista com itens esconde o estado vazio e cria um <li> por item', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a'), makeItem('b')], { loopPlaylist: true });
  assert.equal(view.emptyStateEl.hidden, true);
  assert.equal(view.listEl.children.length, 2);
});

test('onImportClick: dispara ao clicar em "Importar mídia"', () => {
  const view = new EditorView({ root: makeRoot() });
  let called = false;
  view.onImportClick(() => { called = true; });
  view.importButtonEl.dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(called, true);
});

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Campos de edição (duração/transição/fit/startAt/remover) só existem depois de expandir o item (painel expansível, Etapa 11). */
function expandItem(view, itemEl) {
  itemEl.querySelector('.editor-more').dispatchEvent(new view._doc.defaultView.Event('click'));
}

test('onRemove: só dispara se confirmFn (síncrono) retornar true', async () => {
  const rootTrue = makeRoot();
  const viewTrue = new EditorView({ root: rootTrue, confirmFn: () => true });
  viewTrue.render([makeItem('a')], {});
  expandItem(viewTrue, rootTrue.querySelector('.editor-item'));
  let removedId = null;
  viewTrue.onRemove((id) => { removedId = id; });
  rootTrue.querySelector('.editor-delete').dispatchEvent(new rootTrue.ownerDocument.defaultView.Event('click'));
  await nextTick();
  assert.equal(removedId, 'a');

  const rootFalse = makeRoot();
  const viewFalse = new EditorView({ root: rootFalse, confirmFn: () => false });
  viewFalse.render([makeItem('a')], {});
  expandItem(viewFalse, rootFalse.querySelector('.editor-item'));
  let removedId2 = null;
  viewFalse.onRemove((id) => { removedId2 = id; });
  rootFalse.querySelector('.editor-delete').dispatchEvent(new rootFalse.ownerDocument.defaultView.Event('click'));
  await nextTick();
  assert.equal(removedId2, null);
});

test('onRemove: confirmFn assíncrono (ex.: um modal real) também é suportado', async () => {
  const root = makeRoot();
  const view = new EditorView({ root, confirmFn: () => Promise.resolve(true) });
  view.render([makeItem('a')], {});
  expandItem(view, root.querySelector('.editor-item'));
  let removedId = null;
  view.onRemove((id) => { removedId = id; });
  root.querySelector('.editor-delete').dispatchEvent(new root.ownerDocument.defaultView.Event('click'));
  await nextTick();
  assert.equal(removedId, 'a');
});

test('onMoveUp/onMoveDown: primeiro item tem "mover para cima" desabilitado; último tem "mover para baixo" desabilitado', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a'), makeItem('b'), makeItem('c')], {});
  const items = [...view.listEl.querySelectorAll('.editor-item')];
  assert.equal(items[0].querySelector('.editor-move-up').disabled, true);
  assert.equal(items[2].querySelector('.editor-move-down').disabled, true);
  assert.equal(items[1].querySelector('.editor-move-up').disabled, false);
});

test('onMoveUp/onMoveDown: disparam com o id correto', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a'), makeItem('b')], {});
  let up = null;
  let down = null;
  view.onMoveUp((id) => { up = id; });
  view.onMoveDown((id) => { down = id; });
  const items = [...view.listEl.querySelectorAll('.editor-item')];
  items[1].querySelector('.editor-move-up').dispatchEvent(new view._doc.defaultView.Event('click'));
  items[0].querySelector('.editor-move-down').dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(up, 'b');
  assert.equal(down, 'a');
});

test('onEditField: editar duração dispara (id, "duration", número)', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a', { duration: 10 })], {});
  expandItem(view, view.listEl.querySelector('.editor-item'));
  const edits = [];
  view.onEditField((id, field, value) => edits.push({ id, field, value }));
  const input = view.listEl.querySelector('.editor-duration');
  input.value = '25';
  input.dispatchEvent(new view._doc.defaultView.Event('change'));
  assert.deepEqual(edits[0], { id: 'a', field: 'duration', value: 25 });
});

test('onEditField: editar transição dispara (id, "transition", valor)', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  expandItem(view, view.listEl.querySelector('.editor-item'));
  const edits = [];
  view.onEditField((id, field, value) => edits.push({ id, field, value }));
  const select = view.listEl.querySelector('.editor-transition');
  select.value = 'zoom';
  select.dispatchEvent(new view._doc.defaultView.Event('change'));
  assert.deepEqual(edits[0], { id: 'a', field: 'transition', value: 'zoom' });
});

test('onEditField: editar fit dispara (id, "fit", valor)', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  expandItem(view, view.listEl.querySelector('.editor-item'));
  const edits = [];
  view.onEditField((id, field, value) => edits.push({ id, field, value }));
  const select = view.listEl.querySelector('.editor-fit');
  select.value = 'cover';
  select.dispatchEvent(new view._doc.defaultView.Event('change'));
  assert.deepEqual(edits[0], { id: 'a', field: 'fit', value: 'cover' });
});

test('onEditField: editar startAt dispara (id, "startAt", valor)', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  expandItem(view, view.listEl.querySelector('.editor-item'));
  const edits = [];
  view.onEditField((id, field, value) => edits.push({ id, field, value }));
  const input = view.listEl.querySelector('.editor-startat');
  input.value = '19:30:00';
  input.dispatchEvent(new view._doc.defaultView.Event('change'));
  assert.deepEqual(edits[0], { id: 'a', field: 'startAt', value: '19:30:00' });
});

test('onToggleLoop: dispara ao clicar no botão de loop; render() reflete o estado', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([], { loopPlaylist: true });
  assert.equal(view.loopButtonEl.getAttribute('aria-pressed'), 'true');
  let toggled = false;
  view.onToggleLoop(() => { toggled = true; });
  view.loopButtonEl.dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(toggled, true);
  view.render([], { loopPlaylist: false });
  assert.equal(view.loopButtonEl.getAttribute('aria-pressed'), 'false');
});

test('onSelectItem: dispara ao tocar no botão de apresentar do item', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  let selected = null;
  view.onSelectItem((id) => { selected = id; });
  view.listEl.querySelector('.editor-item-present').dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(selected, 'a');
});

test('showFeedback()/showError(): alternam visibilidade e texto', () => {
  const view = new EditorView({ root: makeRoot() });
  view.showFeedback('3 arquivos importados');
  assert.equal(view.feedbackEl.hidden, false);
  assert.equal(view.feedbackEl.textContent, '3 arquivos importados');
  view.showFeedback('');
  assert.equal(view.feedbackEl.hidden, true);

  view.showError('Falha ao salvar');
  assert.equal(view.errorEl.hidden, false);
  assert.equal(view.errorEl.textContent, 'Falha ao salvar');
});

test('controles possuem aria-label (import, loop, mover, remover, apresentar, campos)', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  assert.ok(view.importButtonEl.getAttribute('aria-label'));
  const item = view.listEl.querySelector('.editor-item');
  for (const selector of ['.editor-item-present', '.editor-move-up', '.editor-move-down']) {
    const el = item.querySelector(selector);
    assert.ok(el.getAttribute('aria-label'), `${selector} deveria ter aria-label`);
  }
  expandItem(view, item);
  const expandedItem = view.listEl.querySelector('.editor-item');
  for (const selector of ['.editor-delete', '.editor-duration', '.editor-transition', '.editor-fit', '.editor-startat']) {
    const el = expandedItem.querySelector(selector);
    assert.ok(el.getAttribute('aria-label'), `${selector} deveria ter aria-label`);
  }
});

test('construtor exige um root DOM válido', () => {
  assert.throws(() => new EditorView({ root: null }));
});

test('nunca expõe o id interno como texto visível — usa displayName > name > fallback por mime', () => {
  const view = new EditorView({ root: makeRoot() });
  const uidLike = '1784815658490-2aead6842ffca8';
  view.render([makeItem(uidLike, { name: 'ferias.jpg', displayName: 'Foto das férias' })], {});
  const card = view.listEl.querySelector('.playlist-card-name');
  assert.equal(card.textContent, 'Foto das férias');
  // O id interno pode existir como atributo técnico (data-id, já usado pelo
  // próprio desktop em control.js) — o que não pode é aparecer como TEXTO
  // visível ao usuário em nenhum elemento da UI.
  assert.doesNotMatch(view.listEl.textContent, new RegExp(uidLike));
});

test('card compacto: thumbnail reflete o estado passado em render(items, settings, {thumbnails})', () => {
  const view = new EditorView({ root: makeRoot() });
  const thumbnails = new Map([['a', { status: 'ready', src: 'blob:fake/1' }]]);
  view.render([makeItem('a')], {}, { thumbnails });
  const img = view.listEl.querySelector('.media-thumbnail img');
  assert.equal(img.src, 'blob:fake/1');
});

test('item com thumbnail "unavailable" mostra aviso e botão "Selecionar novamente"; onReselectMedia dispara com o id', () => {
  const view = new EditorView({ root: makeRoot() });
  const thumbnails = new Map([['a', { status: 'unavailable' }]]);
  view.render([makeItem('a')], {}, { thumbnails });
  const warn = view.listEl.querySelector('.media-unavailable');
  assert.ok(warn, 'deveria mostrar aviso de mídia indisponível');
  let reselected = null;
  view.onReselectMedia((id) => { reselected = id; });
  warn.querySelector('button').dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(reselected, 'a');
});

test('item ativo (currentId) recebe o badge "No ar" e a classe is-current', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a'), makeItem('b')], {}, { currentId: 'b' });
  const cards = [...view.listEl.querySelectorAll('.playlist-card')];
  assert.equal(cards[0].classList.contains('is-current'), false);
  assert.equal(cards[1].classList.contains('is-current'), true);
  assert.match(cards[1].querySelector('.playlist-card-meta').textContent, /No ar/);
});

test('editor expansível: fechado por padrão, abre ao tocar em editar, fecha ao tocar de novo', () => {
  const view = new EditorView({ root: makeRoot() });
  view.render([makeItem('a')], {});
  assert.equal(view.listEl.querySelector('.playlist-item-editor'), null);
  view.listEl.querySelector('.editor-more').dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.ok(view.listEl.querySelector('.playlist-item-editor'));
  view.listEl.querySelector('.editor-more').dispatchEvent(new view._doc.defaultView.Event('click'));
  assert.equal(view.listEl.querySelector('.playlist-item-editor'), null);
});
