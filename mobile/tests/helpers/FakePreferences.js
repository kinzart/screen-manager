// Fake em memória de um subconjunto de PreferencesPlugin (get, set,
// remove), usado SOMENTE em testes Node. Nunca importado por código de
// produção. Reproduz o contrato real: SetOptions.value é sempre string
// (lança TypeError se não for, assim como o plugin nativo rejeitaria).

export class FakePreferences {
  constructor() {
    this.store = new Map();
    this.calls = []; // { method, options }
    this._failNextGet = null; // { key, error }
    this._failNextSet = null; // { key, error }
    this._clearCalls = 0;
  }

  async get(options) {
    this.calls.push({ method: 'get', options });
    if (this._failNextGet && this._failNextGet.key === options.key) {
      const error = this._failNextGet.error;
      this._failNextGet = null;
      throw error;
    }
    return { value: this.store.has(options.key) ? this.store.get(options.key) : null };
  }

  async set(options) {
    this.calls.push({ method: 'set', options });
    if (typeof options.value !== 'string') {
      throw new TypeError('FakePreferences.set: value deve ser string (contrato de PreferencesPlugin.SetOptions)');
    }
    if (this._failNextSet && this._failNextSet.key === options.key) {
      const error = this._failNextSet.error;
      this._failNextSet = null;
      throw error;
    }
    this.store.set(options.key, options.value);
  }

  async remove(options) {
    this.calls.push({ method: 'remove', options });
    this.store.delete(options.key);
  }

  async clear() {
    this.calls.push({ method: 'clear', options: undefined });
    this._clearCalls += 1;
    this.store.clear();
  }

  // --- helpers de teste ---

  seed(key, value) {
    this.store.set(key, value);
  }

  failNextGet(key, error) {
    this._failNextGet = { key, error };
  }

  failNextSet(key, error) {
    this._failNextSet = { key, error };
  }

  keys() {
    return [...this.store.keys()];
  }

  clearCallCount() {
    return this._clearCalls;
  }

  callsFor(method) {
    return this.calls.filter((c) => c.method === method);
  }
}
