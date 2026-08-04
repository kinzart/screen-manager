// Fake em memória de um subconjunto de FilePickerPlugin
// (@capawesome/capacitor-file-picker): pickMedia, copyFile. Usado SOMENTE
// em testes Node. Nunca importado por código de produção. Reproduz o
// contrato real observado em node_modules/@capawesome/capacitor-file-picker/
// dist/esm/definitions.d.ts e web.js: cancelamento lança
// `Error('pickFiles canceled.')`; pickMedia retorna `{ files: PickedFile[] }`
// com `path` (nunca `data`/base64, pois o adapter sempre chama com
// readData:false).

export class FakeMediaPicker {
  constructor() {
    this.calls = [];
    this._nextPickResult = null; // { files: [...] }
    this._nextPickError = null;
    this._nextCopyError = null;
    this._copiedFiles = []; // registro de chamadas copyFile bem-sucedidas
  }

  async pickMedia(options) {
    this.calls.push({ method: 'pickMedia', options });
    if (this._nextPickError) {
      const error = this._nextPickError;
      this._nextPickError = null;
      throw error;
    }
    const result = this._nextPickResult || { files: [] };
    this._nextPickResult = null;
    return result;
  }

  async copyFile(options) {
    this.calls.push({ method: 'copyFile', options });
    if (this._nextCopyError) {
      const error = this._nextCopyError;
      this._nextCopyError = null;
      throw error;
    }
    this._copiedFiles.push(options);
  }

  // --- helpers de teste ---

  setNextPickResult(files) {
    this._nextPickResult = { files };
  }

  /** Simula cancelamento do picker (mensagem real da implementação web do plugin). */
  cancelNextPick() {
    this._nextPickError = new Error('pickFiles canceled.');
  }

  setNextPickError(error) {
    this._nextPickError = error;
  }

  setNextCopyError(error) {
    this._nextCopyError = error;
  }

  copiedTo(path) {
    return this._copiedFiles.find((c) => c.to === path);
  }

  callsFor(method) {
    return this.calls.filter((c) => c.method === method);
  }
}
