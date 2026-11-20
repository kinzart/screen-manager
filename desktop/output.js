// The same clock drives the Electron output and newly connected TV browsers.
class OutputState {
  constructor(now = Date.now) {
    this.now = now;
    this.action = 'logo';
    this.sequence = 0;
    this.revision = 0;
    this.position = 0;
    this.since = now();
    this.paused = false;
    this.held = false;
  }

  seconds() {
    return this.position + (this.action === 'show' && !this.paused && !this.held
      ? Math.max(0, this.now() - this.since) / 1000 : 0);
  }

  command({ action, item }) {
    this.position = this.seconds();
    this.since = this.now();
    if (action === 'pause' || action === 'resume') {
      this.paused = action === 'pause';
    } else {
      this.action = action;
      this.item = action === 'show' ? item : null;
      this.paused = false;
      this.position = 0;
      this.sequence++;
    }
    this.revision++;
  }

  hold(value) {
    if (this.held === value) return false;
    this.position = this.seconds();
    this.since = this.now();
    this.held = value;
    this.revision++;
    return true;
  }

  snapshot() {
    return { action: this.action, item: this.item, sequence: this.sequence, revision: this.revision,
      paused: this.paused || this.held, position: this.seconds() };
  }
}

class DisplayRecovery {
  constructor({ saved, list, identify, reconnect, remember, attach, hide, notify, retryDelays = [2000, 5000, 15000, 30000, 60000] }) {
    Object.assign(this, { target: saved, list, identify, reconnect, remember, attach, hide, notify, retryDelays });
    this.attempt = 0;
    this.epoch = 0;
    this.message = '';
    this.blocked = false;
  }

  state() {
    return { targetId: this.target?.id || this.attachedId || '', name: this.target?.label || '',
      castName: this.target?.native?.castName || '', kind: this.target?.native?.kind || 'unknown',
      blocked: this.blocked, attempt: this.attempt, message: this.message };
  }

  cancel() {
    clearTimeout(this.retry);
    clearTimeout(this.identityRetry);
    this.retry = null;
    this.search?.abort();
    this.probe?.abort();
    this.attempt = 0;
    this.epoch++;
  }

  bind(display) {
    this.search?.abort();
    clearTimeout(this.retry);
    this.retry = null;
    this.attempt = 0;
    this.blocked = false;
    this.attachedId = String(display.id);
    this.message = 'Saída conectada';
    this.attach(display);
    this.notify(this.state());
  }

  capture(display) {
    const target = { id: String(display.id), label: display.label || '', internal: !!display.internal };
    this.target = target;
    this.remember(target);
    this.bind(display);
    this.identifyAttached(display, target);
  }

  identifyAttached(display, target) {
    this.probe?.abort();
    clearTimeout(this.identityRetry);
    const probe = this.probe = new AbortController();
    Promise.resolve(this.identify(display, probe.signal)).then(native => {
      if (probe.signal.aborted || this.target !== target || this.attachedId !== target.id) return;
      if (native) {
        target.native = native;
        this.remember(target);
        this.notify(this.state());
      } else if (process.platform === 'win32') {
        this.identityRetry = setTimeout(() => this.identifyAttached(display, target), 30000);
        this.identityRetry.unref?.();
      }
    }).catch(() => {});
  }

  select(id) {
    const display = this.list().find(item => String(item.id) === String(id));
    if (!display) throw new Error('Esta saída já está desconectada.');
    if (String(id) === this.attachedId && this.target?.id === this.attachedId) return;
    this.cancel();
    this.capture(display);
  }

  setCastName(name) {
    if (this.target?.native?.kind !== 'wireless') throw new Error('Selecione uma TV Miracast.');
    this.target.native.castName = name.trim().slice(0, 120);
    this.remember(this.target);
    this.cancel();
    this.refresh();
  }

  missing() {
    clearTimeout(this.identityRetry);
    this.hide();
    this.attachedId = null;
    this.blocked = true;
    this.message = 'Aguardando a última tela';
    this.notify(this.state());
  }

  async refresh(removedId) {
    if (this.suspended) return;
    const all = this.list();
    const primary = all.find(d => d.primary);
    const external = all.find(d => !d.primary);
    if (!this.target) {
      if (external) this.capture(external);
      else if (primary) this.bind(primary);
      return;
    }
    if (removedId != null && String(removedId) === this.attachedId) this.missing();
    const known = all.find(d => String(d.id) === this.target.id && d.label === this.target.label);
    if (known && this.attachedId === this.target.id) {
      this.bind(known);
      return;
    }
    if (!this.blocked) this.missing();
    this.probe?.abort();
    const probe = this.probe = new AbortController();
    let match = known;
    const devicePath = this.target.native?.devicePath;
    if (devicePath) {
      const candidates = all.filter(d => !!d.internal === this.target.internal);
      const matches = await Promise.all(candidates.map(async display => {
        const native = await this.identify(display, probe.signal).catch(() => null);
        return native?.devicePath?.toLowerCase() === devicePath.toLowerCase() ? display : null;
      }));
      if (probe.signal.aborted) return;
      const found = matches.filter(Boolean);
      match = found.length === 1 ? found[0] : null;
    }
    if (match) {
      if (this.target.id !== String(match.id) || this.target.label !== match.label) {
        Object.assign(this.target, { id: String(match.id), label: match.label });
        this.remember(this.target);
      }
      this.bind(match);
      if (!this.target.native) this.identifyAttached(match, this.target);
    } else {
      this.schedule();
    }
  }

  schedule() {
    if (this.retry || this.search || this.suspended) return;
    const delay = this.retryDelays[Math.min(this.attempt, this.retryDelays.length - 1)];
    this.retry = setTimeout(async () => {
      this.retry = null;
      if (!this.blocked || this.suspended) return;
      const epoch = this.epoch;
      const search = this.search = new AbortController();
      this.attempt++;
      try {
        const wireless = this.target.native?.kind === 'wireless';
        this.message = wireless ? 'Procurando a TV no Windows…' : 'Aguardando o sinal da tela no Windows…';
        this.notify(this.state());
        if (wireless) {
          const result = await this.reconnect(this.target.native, search.signal);
          if (!search.signal.aborted && result?.message) this.message = result.message;
        }
      } catch (error) {
        if (!search.signal.aborted) this.message = error.message;
      } finally {
        if (this.search === search) this.search = null;
        if (this.blocked && !this.suspended) {
          if (epoch === this.epoch) this.notify(this.state());
          await this.refresh();
        }
      }
    }, delay);
    this.retry.unref?.();
  }

  suspend() {
    this.suspended = true;
    this.cancel();
    if (this.target) this.missing();
  }

  resume() {
    this.suspended = false;
    return this.refresh();
  }
}

module.exports = { DisplayRecovery, OutputState };
