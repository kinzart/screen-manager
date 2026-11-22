'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class StudioError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'StudioError';
    this.status = status;
    if (code) this.code = code;
  }
}

const COLLECTIONS = ['spaces', 'playlists', 'screens', 'media', 'uploads', 'sessions', 'pairings'];
function emptyDatabase() {
  return Object.fromEntries([
    ['schemaVersion', 1], ['revision', 0],
    ...COLLECTIONS.map(name => [name, {}]),
  ]);
}
function validateDatabase(db) {
  if (!db || db.schemaVersion !== 1 || !Number.isSafeInteger(db.revision) || db.revision < 0 ||
      COLLECTIONS.some(name => !db[name] || typeof db[name] !== 'object' || Array.isArray(db[name]))) {
    throw new Error('O arquivo de dados do FBS Studio tem formato inválido. Restaure um backup antes de iniciar.');
  }
}

class StudioStore {
  static async open({ dataDir, adminPassword, now = Date.now }) {
    if (!dataDir || typeof adminPassword !== 'string' || adminPassword.length < 16) {
      throw new Error('Defina um diretório de dados privado e uma senha com pelo menos 16 caracteres.');
    }
    const store = new StudioStore();
    store.dataDir = path.resolve(dataDir);
    store.password = adminPassword;
    store.now = now;
    store._queue = Promise.resolve();
    store._closed = false;
    await fs.mkdir(store.dataDir, { recursive: true, mode: 0o700 });
    try {
      store.db = JSON.parse(await fs.readFile(path.join(store.dataDir, 'state.json'), 'utf8'));
      validateDatabase(store.db);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      store.db = emptyDatabase();
    }
    return store;
  }

  change(fn) {
    if (this._closed) return Promise.reject(new Error('O armazenamento já foi fechado.'));
    const operation = this._queue.then(async () => {
      const draft = structuredClone(this.db);
      const result = structuredClone(await fn(draft));
      draft.revision = this.db.revision + 1;
      validateDatabase(draft);
      const temporary = path.join(this.dataDir, `.state-${randomUUID()}.tmp`);
      let handle;
      let committed = false;
      try {
        handle = await fs.open(temporary, 'wx', 0o600);
        await handle.writeFile(JSON.stringify(draft));
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temporary, path.join(this.dataDir, 'state.json'));
        this.db = draft;
        committed = true;
        // Persist the directory entry where the OS supports directory fsync.
        if (process.platform !== 'win32') {
          let directory;
          try {
            directory = await fs.open(this.dataDir, 'r');
            await directory.sync();
          } catch { /* rename is already committed; never report a false rollback */ }
          finally { await directory?.close().catch(() => {}); }
        }
        return result;
      } finally {
        await handle?.close().catch(() => {});
        if (!committed) await fs.unlink(temporary).catch(() => {});
      }
    });
    this._queue = operation.catch(() => {});
    return operation;
  }

  async close() {
    this._closed = true;
    await this._queue;
  }
}

module.exports = { StudioStore, StudioError };
