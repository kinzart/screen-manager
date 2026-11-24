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
const SCHEMA_VERSION = 2;
function emptyDatabase() {
  return Object.fromEntries([
    ['schemaVersion', SCHEMA_VERSION], ['revision', 0],
    ...COLLECTIONS.map(name => [name, {}]),
  ]);
}
function validateDatabase(db) {
  if (!db || db.schemaVersion !== SCHEMA_VERSION || !Number.isSafeInteger(db.revision) || db.revision < 0 ||
      COLLECTIONS.some(name => !db[name] || typeof db[name] !== 'object' || Array.isArray(db[name]))) {
    throw new Error('O arquivo de dados do FBS Studio tem formato inválido. Restaure um backup antes de iniciar.');
  }
}

// Migrações puras por versão. Cada uma recebe o documento da versão N e devolve N+1.
const MIGRATIONS = {
  1(db) {
    for (const screen of Object.values(db.screens || {})) {
      screen.program ??= null;
      screen.override ??= null;
      screen.commands ??= [];
      screen.device ??= null;
      screen.controlRevision ??= 0;
    }
    for (const media of Object.values(db.media || {})) {
      media.sha256 ??= null;
      media.chunkSize ??= null;
      media.chunks ??= null;
    }
    db.schemaVersion = 2;
    return db;
  },
};
function migrateDatabase(db) {
  if (!db || !Number.isSafeInteger(db.schemaVersion) || db.schemaVersion < 1 || db.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Versão de dados do FBS Studio não suportada (${db?.schemaVersion}). Atualize o servidor ou restaure um backup.`);
  }
  let current = db;
  while (current.schemaVersion < SCHEMA_VERSION) current = MIGRATIONS[current.schemaVersion](current);
  return current;
}

async function writeAtomic(dataDir, name, text) {
  const temporary = path.join(dataDir, `.${name}-${randomUUID()}.tmp`);
  let handle;
  let committed = false;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(text);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, path.join(dataDir, name));
    committed = true;
  } finally {
    await handle?.close().catch(() => {});
    if (!committed) await fs.unlink(temporary).catch(() => {});
  }
}

class StudioStore {
  static async open({ dataDir, adminPassword, now = Date.now }) {
    // Senha do operador: PIN de exatamente 6 números (prático no celular; o login tem bloqueio global
    // contra tentativas) ou uma senha longa de 16+ caracteres.
    if (!dataDir || typeof adminPassword !== 'string' || !(/^\d{6}$/.test(adminPassword) || adminPassword.length >= 16)) {
      throw new Error('Defina um diretório de dados privado e uma senha de 6 números ou com pelo menos 16 caracteres.');
    }
    const store = new StudioStore();
    store.dataDir = path.resolve(dataDir);
    store.password = adminPassword;
    store.now = now;
    store._queue = Promise.resolve();
    store._closed = false;
    await fs.mkdir(store.dataDir, { recursive: true, mode: 0o700 });
    let raw;
    try {
      raw = await fs.readFile(path.join(store.dataDir, 'state.json'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (raw === undefined) {
      store.db = emptyDatabase();
      return store;
    }
    const parsed = JSON.parse(raw);
    const fromVersion = parsed?.schemaVersion;
    const migrated = migrateDatabase(parsed);
    validateDatabase(migrated);
    if (fromVersion !== SCHEMA_VERSION) {
      // Backup byte a byte da versão anterior ANTES de gravar o formato novo.
      await writeAtomic(store.dataDir, `state.v${fromVersion}-${now()}.json`, raw);
      await writeAtomic(store.dataDir, 'state.json', JSON.stringify(migrated));
      store.migratedFrom = fromVersion;
    }
    store.db = migrated;
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

module.exports = { StudioStore, StudioError, migrateDatabase, SCHEMA_VERSION };
