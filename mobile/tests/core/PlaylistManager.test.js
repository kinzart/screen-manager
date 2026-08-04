import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaylistManager } from '../../www/app/core/PlaylistManager.js';

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

test('list() retorna snapshot que não expõe o array interno', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  const snapshot = manager.list();
  snapshot.push(makeItem('b'));
  snapshot[0].name = 'mutated';
  assert.equal(manager.length, 1);
  assert.equal(manager.findById('a').name, 'a.jpg');
});

test('add() adiciona item e preserva ordem de inserção', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  manager.add(makeItem('b'));
  assert.deepEqual(manager.list().map((i) => i.id), ['a', 'b']);
});

test('add() rejeita id duplicado', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  assert.throws(() => manager.add(makeItem('a')), /duplicado/);
});

test('add() rejeita item inválido (delega para validatePlaylistItem)', () => {
  const manager = new PlaylistManager();
  assert.throws(() => manager.add(makeItem('a', { type: 'audio' })), /type/);
});

test('update() atualiza campos existentes e mantém o id', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  const updated = manager.update('a', { duration: 20 });
  assert.equal(updated.duration, 20);
  assert.equal(updated.id, 'a');
  assert.equal(manager.findById('a').duration, 20);
});

test('update() rejeita id inexistente', () => {
  const manager = new PlaylistManager();
  assert.throws(() => manager.update('missing', { duration: 5 }), /não encontrado/);
});

test('update() rejeita patch que torna o item inválido', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  assert.throws(() => manager.update('a', { duration: -1 }), /duration/);
});

test('remove() remove item existente e retorna true', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  assert.equal(manager.remove('a'), true);
  assert.equal(manager.length, 0);
});

test('remove() retorna false para id inexistente, sem lançar', () => {
  const manager = new PlaylistManager();
  assert.equal(manager.remove('missing'), false);
});

test('move() reordena para um índice absoluto', () => {
  const manager = new PlaylistManager();
  ['a', 'b', 'c'].forEach((id) => manager.add(makeItem(id)));
  manager.move('c', 0);
  assert.deepEqual(manager.list().map((i) => i.id), ['c', 'a', 'b']);
});

test('move() rejeita índice inválido', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  assert.throws(() => manager.move('a', 5), /índice inválido/);
  assert.throws(() => manager.move('a', -1), /índice inválido/);
});

test('move() rejeita id inexistente', () => {
  const manager = new PlaylistManager();
  assert.throws(() => manager.move('missing', 0), /não encontrado/);
});

test('moveBy() troca com o vizinho e é no-op nas bordas', () => {
  const manager = new PlaylistManager();
  ['a', 'b', 'c'].forEach((id) => manager.add(makeItem(id)));
  manager.moveBy('b', -1);
  assert.deepEqual(manager.list().map((i) => i.id), ['b', 'a', 'c']);
  manager.moveBy('b', -1); // já está no topo -> no-op
  assert.deepEqual(manager.list().map((i) => i.id), ['b', 'a', 'c']);
  manager.moveBy('c', 1); // já está no fim -> no-op
  assert.deepEqual(manager.list().map((i) => i.id), ['b', 'a', 'c']);
});

test('replace() substitui toda a playlist e rejeita ids duplicados', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  manager.replace([makeItem('x'), makeItem('y')]);
  assert.deepEqual(manager.list().map((i) => i.id), ['x', 'y']);
  assert.throws(() => manager.replace([makeItem('x'), makeItem('x')]), /duplicado/);
});

test('clear() esvazia a playlist', () => {
  const manager = new PlaylistManager();
  manager.add(makeItem('a'));
  manager.clear();
  assert.equal(manager.length, 0);
});

test('findById() retorna null para id inexistente', () => {
  const manager = new PlaylistManager();
  assert.equal(manager.findById('missing'), null);
});
