// Fake em memória de um subconjunto de FilesystemPlugin (mkdir, readFile,
// writeFile, getUri, deleteFile), usado SOMENTE em testes Node. Nunca
// importado por código de produção. Reproduz, o quanto possível, o
// comportamento observável da implementação web real do plugin
// (node_modules/@capacitor/filesystem/dist/esm/web.js): "File does not
// exist." para leitura/remoção de arquivo ausente.
//
// getUri/deleteFile foram adicionados na Etapa 3 (CapacitorMedia) — não
// alteram o comportamento de mkdir/readFile/writeFile usado pelos testes
// de persistência da Etapa 2.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeFilesystem {
  constructor() {
    this.files = new Map(); // `${directory}::${path}` -> string
    this.dirs = new Set(); // `${directory}::${path}`
    this.calls = []; // { method, options }
    this._activeWrites = new Map(); // key -> contagem de escritas em voo
    this._concurrencyViolations = [];
    this._failNextRead = null; // { path, error }
    this._failNextWrite = null; // { path, error }
    this._writeDelayMs = 0;
  }

  _key(directory, filePath) {
    return `${directory}::${filePath}`;
  }

  async mkdir(options) {
    this.calls.push({ method: 'mkdir', options });
    this.dirs.add(this._key(options.directory, options.path));
  }

  async readFile(options) {
    this.calls.push({ method: 'readFile', options });
    if (this._failNextRead && this._failNextRead.path === options.path) {
      const error = this._failNextRead.error;
      this._failNextRead = null;
      throw error;
    }
    const key = this._key(options.directory, options.path);
    if (!this.files.has(key)) {
      throw new Error('File does not exist.');
    }
    return { data: this.files.get(key) };
  }

  async writeFile(options) {
    this.calls.push({ method: 'writeFile', options });
    const key = this._key(options.directory, options.path);
    const active = this._activeWrites.get(key) || 0;
    if (active > 0) {
      this._concurrencyViolations.push({ path: options.path, at: Date.now() });
    }
    this._activeWrites.set(key, active + 1);
    try {
      if (this._writeDelayMs) await delay(this._writeDelayMs);
      if (this._failNextWrite && this._failNextWrite.path === options.path) {
        const error = this._failNextWrite.error;
        this._failNextWrite = null;
        throw error;
      }
      this.files.set(key, options.data);
      return { uri: `fake://${key}` };
    } finally {
      this._activeWrites.set(key, (this._activeWrites.get(key) || 1) - 1);
    }
  }

  async getUri(options) {
    this.calls.push({ method: 'getUri', options });
    return { uri: `file:///fake-root/${options.directory}/${options.path}` };
  }

  async deleteFile(options) {
    this.calls.push({ method: 'deleteFile', options });
    const key = this._key(options.directory, options.path);
    if (!this.files.has(key)) {
      throw new Error('File does not exist.');
    }
    this.files.delete(key);
  }

  // --- helpers de teste (não fazem parte de FilesystemPlugin) ---

  /** Simula o efeito colateral de uma cópia nativa bem-sucedida (FilePicker.copyFile). */
  markAsCopied(directory, filePath, { size = 0 } = {}) {
    this.files.set(this._key(directory, filePath), '0'.repeat(size));
  }

  hasFile(directory, filePath) {
    return this.files.has(this._key(directory, filePath));
  }

  seedFile(directory, filePath, data) {
    this.files.set(this._key(directory, filePath), data);
  }

  hasDir(directory, dirPath) {
    return this.dirs.has(this._key(directory, dirPath));
  }

  readRawFile(directory, filePath) {
    return this.files.get(this._key(directory, filePath));
  }

  failNextRead(filePath, error) {
    this._failNextRead = { path: filePath, error };
  }

  failNextWrite(filePath, error) {
    this._failNextWrite = { path: filePath, error };
  }

  setWriteDelay(ms) {
    this._writeDelayMs = ms;
  }

  hadConcurrencyViolation() {
    return this._concurrencyViolations.length > 0;
  }

  callsFor(method) {
    return this.calls.filter((c) => c.method === method);
  }
}
