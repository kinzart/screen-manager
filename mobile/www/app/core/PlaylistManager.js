// Gestão de playlist. Extraído/adaptado de src/control.js: add (addFiles,
// linhas 207-229), update (linhas 193-200), remove (linha 128), reorder por
// drag&drop (linhas 110-114) e por botões move-up/move-down (moveItem,
// linhas 185-192), replace/clear (linhas 371-378, 492-493).
// Núcleo puro: sem Electron, Capacitor ou DOM. Reordenação por toque
// (Etapa 5) chamará move()/moveBy() em vez de dragstart/drop.

import { validatePlaylistItem } from './models.js';

export class PlaylistManager {
  constructor(initialItems = []) {
    this._items = [];
    if (initialItems.length) this.replace(initialItems);
  }

  /** Snapshot imutável — nunca expõe o array interno. */
  list() {
    return this._items.map((item) => ({ ...item }));
  }

  get length() {
    return this._items.length;
  }

  findById(id) {
    const item = this._items.find((x) => x.id === id);
    return item ? { ...item } : null;
  }

  add(item) {
    validatePlaylistItem(item);
    if (this._items.some((x) => x.id === item.id)) {
      throw new Error(`PlaylistManager.add: id duplicado "${item.id}"`);
    }
    this._items.push({ ...item });
    return this.list();
  }

  update(id, patch) {
    const index = this._items.findIndex((x) => x.id === id);
    if (index === -1) {
      throw new Error(`PlaylistManager.update: id não encontrado "${id}"`);
    }
    const next = { ...this._items[index], ...patch, id };
    validatePlaylistItem(next);
    this._items[index] = next;
    return { ...next };
  }

  remove(id) {
    const index = this._items.findIndex((x) => x.id === id);
    if (index === -1) return false;
    this._items.splice(index, 1);
    return true;
  }

  /** Move o item para um índice absoluto (drag&drop desktop, linhas 110-114). */
  move(id, toIndex) {
    const from = this._items.findIndex((x) => x.id === id);
    if (from === -1) {
      throw new Error(`PlaylistManager.move: id não encontrado "${id}"`);
    }
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this._items.length) {
      throw new Error(`PlaylistManager.move: índice inválido ${toIndex}`);
    }
    const [moved] = this._items.splice(from, 1);
    this._items.splice(toIndex, 0, moved);
    return this.list();
  }

  /** Move relativo (botões ↑/↓ desktop, moveItem linhas 185-192): no-op nas bordas. */
  moveBy(id, delta) {
    const from = this._items.findIndex((x) => x.id === id);
    if (from === -1) {
      throw new Error(`PlaylistManager.moveBy: id não encontrado "${id}"`);
    }
    const to = from + delta;
    if (to < 0 || to >= this._items.length) return this.list();
    [this._items[from], this._items[to]] = [this._items[to], this._items[from]];
    return this.list();
  }

  replace(items) {
    const seen = new Set();
    for (const item of items) {
      validatePlaylistItem(item);
      if (seen.has(item.id)) {
        throw new Error(`PlaylistManager.replace: id duplicado "${item.id}"`);
      }
      seen.add(item.id);
    }
    this._items = items.map((item) => ({ ...item }));
    return this.list();
  }

  clear() {
    this._items = [];
  }
}
