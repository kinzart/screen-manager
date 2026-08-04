// Motor de reprodução. Extraído/adaptado de src/control.js:
// take (233-246), start (247-250), stop (251-258), next/autoNext (259-274),
// toggle (275-280), startTimer (281-298).
//
// Divergência intencional em relação ao desktop: o desktop usa
// setInterval(...,250) contando `elapsed += 0.25` a cada tick (contagem por
// quantidade de ticks). Este núcleo calcula elapsed por TIMESTAMP
// (now - syncTimestamp), conforme exigido pela Etapa 1 — determinístico,
// testável sem temporizadores reais, e resiliente a ticks perdidos/atrasados
// (ex.: app em segundo plano no Android — ver INC-08). O agendamento do
// "tick" de 250ms migra para o bootstrap/UI (fora do core).
//
// Núcleo puro: sem Electron, Capacitor ou DOM.

export class PlaybackEngine {
  constructor({ now } = {}) {
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._resetState();
  }

  _resetState() {
    this.currentId = null;
    this.running = false;
    this.paused = false;
    this.locked = false;
    this.blackout = false;
    this.presenting = false;
    this._elapsedAtSync = 0;
    this._syncTimestamp = null;
  }

  /** Elapsed atual em segundos, calculado por timestamp (nunca por contagem de ticks). */
  elapsed(now = this._now()) {
    if (!this.running || this.paused || this._syncTimestamp == null) {
      return this._elapsedAtSync;
    }
    return this._elapsedAtSync + (now - this._syncTimestamp) / 1000;
  }

  /** Reproduz take(id) — desktop linhas 233-246. */
  take(itemId, playlist, now = this._now()) {
    const item = playlist.find((x) => x.id === itemId);
    if (!item) {
      throw new Error(`PlaybackEngine.take: item não encontrado "${itemId}"`);
    }
    this.currentId = itemId;
    this._elapsedAtSync = 0;
    this._syncTimestamp = now;
    this.running = true;
    this.paused = false;
    this.presenting = true;
    this.blackout = false;
    return { ...item };
  }

  /** Reproduz start() — desktop linhas 247-250: playlist vazia é no-op (retorna null). */
  start(playlist, now = this._now()) {
    if (!playlist.length) return null;
    const id = this.currentId && playlist.some((x) => x.id === this.currentId)
      ? this.currentId
      : playlist[0].id;
    return this.take(id, playlist, now);
  }

  /** Reproduz stop() — desktop linhas 251-258 (menos o envio do comando "logo", que é UI/adapter). */
  stop() {
    this.running = false;
    this.paused = false;
    this.presenting = false;
    this._elapsedAtSync = 0;
    this._syncTimestamp = null;
  }

  pause(now = this._now()) {
    if (!this.running || this.paused) return;
    this._elapsedAtSync = this.elapsed(now);
    this._syncTimestamp = now;
    this.paused = true;
  }

  resume(now = this._now()) {
    if (!this.running || !this.paused) return;
    this._syncTimestamp = now;
    this.paused = false;
  }

  /** Reproduz toggle() — desktop linhas 275-280. */
  toggle(now = this._now()) {
    if (!this.running) return 'start-required';
    if (this.paused) {
      this.resume(now);
      return 'resumed';
    }
    this.pause(now);
    return 'paused';
  }

  /** Reproduz next(delta) — desktop linhas 259-265. */
  next(playlist, delta = 1, now = this._now()) {
    if (!playlist.length) return null;
    const i = playlist.findIndex((x) => x.id === this.currentId);
    const idx = (Math.max(0, i) + delta + playlist.length) % playlist.length;
    return this.take(playlist[idx].id, playlist, now);
  }

  previous(playlist, now = this._now()) {
    return this.next(playlist, -1, now);
  }

  /**
   * Reproduz autoNext() — desktop linhas 266-274.
   * Divergência intencional: se o item atual não existir mais na playlist
   * (removido durante a reprodução), o engine PARA em vez de "adivinhar"
   * um próximo índice — isso espelha o comportamento real do desktop, que
   * ao deletar o item no ar chama stop() explicitamente (linhas 129-132),
   * nunca invoca autoNext() com um id ausente.
   */
  autoNext(playlist, settings, now = this._now()) {
    const i = playlist.findIndex((x) => x.id === this.currentId);
    if (i === -1) {
      this.stop();
      return { action: 'stopped', reason: 'item-missing' };
    }
    if (i === playlist.length - 1 && !settings.loopPlaylist) {
      this.stop();
      return { action: 'stopped', reason: 'end-of-queue' };
    }
    this.next(playlist, 1, now);
    return { action: 'advanced' };
  }

  /**
   * Reproduz o corpo do startTimer() — desktop linhas 281-298 — mas
   * calculado a partir de `now`, não de um setInterval interno. A UI/
   * bootstrap deve chamar tick(...) periodicamente (ex.: a cada 250ms) ou
   * sob demanda (ex.: ao voltar do segundo plano).
   */
  tick(playlist, settings, now = this._now()) {
    if (!this.running || this.paused) return { action: 'idle' };
    const item = playlist.find((x) => x.id === this.currentId);
    if (!item) {
      this.stop();
      return { action: 'stopped', reason: 'item-missing' };
    }
    const elapsed = this.elapsed(now);
    if (item.duration > 0 && elapsed >= item.duration) {
      if (this.locked) {
        this._elapsedAtSync = item.duration;
        this._syncTimestamp = now;
        return { action: 'locked-at-end', elapsed: item.duration };
      }
      return this.autoNext(playlist, settings, now);
    }
    return { action: 'running', elapsed };
  }

  /** RuntimeState para persistência (StoragePort.saveRuntimeState). */
  snapshot(now = this._now()) {
    return {
      currentItemId: this.currentId,
      elapsed: this.elapsed(now),
      isPlaying: this.running && !this.paused,
      locked: this.locked,
      blackout: this.blackout,
      presenting: this.presenting,
    };
  }

  /** Restaura o engine a partir de um RuntimeState salvo, ao reabrir o app. */
  restore(state, playlist, now = this._now()) {
    this._resetState();
    if (!state) return;
    this.locked = !!state.locked;
    this.blackout = !!state.blackout;
    if (state.currentItemId && playlist.some((x) => x.id === state.currentItemId)) {
      this.currentId = state.currentItemId;
      this._elapsedAtSync = Math.max(0, Number(state.elapsed) || 0);
      this._syncTimestamp = now;
      this.presenting = !!state.presenting;
      this.running = this.presenting;
      this.paused = this.presenting && !state.isPlaying;
    }
  }
}
