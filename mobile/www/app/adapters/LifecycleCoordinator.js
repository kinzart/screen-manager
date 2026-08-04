// Observa o ciclo de vida do app (background/foreground) e coordena a
// resposta do AppController + da PresentationPlatform. Nunca importa
// @capacitor/app diretamente — recebe `appState` por injeção (ver
// createLifecycleCoordinator.js, único arquivo autorizado a importar o
// plugin). Isso mantém esta classe testável em Node puro com fakes.
//
// Eventos são processados em fila (this._queue) para que múltiplos
// appStateChange disparados em sequência rápida (ex.: lock/unlock repetido)
// nunca sejam tratados em paralelo — cada handler só começa depois que o
// anterior terminou, evitando corrida entre saves/renders concorrentes.

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[LifecycleCoordinator]', JSON.stringify(payload));
    } catch {
      console.warn('[LifecycleCoordinator]', payload);
    }
  },
};

export class LifecycleCoordinator {
  /**
   * @param {object} deps
   * @param {import('../AppController.js').AppController} deps.controller
   * @param {import('./PresentationPlatform.js').PresentationPlatform} [deps.platform]
   * @param {{addListener:(event:string, cb:(state:{isActive:boolean})=>void)=>(Promise<{remove:()=>Promise<void>|void}>|{remove:()=>Promise<void>|void})}} deps.appState
   * @param {() => number} [deps.now]
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   */
  constructor({ controller, platform, appState, now, logger } = {}) {
    if (!controller) throw new Error('LifecycleCoordinator: "controller" é obrigatório');
    if (!appState || typeof appState.addListener !== 'function') {
      throw new Error('LifecycleCoordinator: "appState" (com addListener) é obrigatório');
    }
    this._controller = controller;
    this._platform = platform || null;
    this._appState = appState;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._logger = logger || DEFAULT_LOGGER;
    this._handle = null;
    this._queue = Promise.resolve();
    this._backgroundedAt = null;
  }

  get isStarted() {
    return this._handle != null;
  }

  /** Registra o listener de appStateChange. Idempotente — chamar duas vezes não duplica o listener. */
  async start() {
    if (this._handle) return;
    this._handle = await this._appState.addListener('appStateChange', (state) => {
      this._enqueue(!!state?.isActive);
    });
  }

  /** Remove o listener. Sempre chamável, mesmo se start() nunca foi chamado ou já foi parado. */
  async stop() {
    const handle = this._handle;
    this._handle = null;
    if (handle && typeof handle.remove === 'function') {
      await handle.remove();
    }
  }

  /** Enfileira o tratamento do evento — serializa eventos concorrentes/rápidos. */
  _enqueue(isActive) {
    this._queue = this._queue
      .then(() => (isActive ? this._handleForeground() : this._handleBackground()))
      .catch((error) => {
        this._logger.warn({ event: 'lifecycle.handler-error', error: String(error?.message || error) });
      });
    return this._queue;
  }

  async _handleBackground() {
    this._backgroundedAt = this._now();
    try {
      await this._controller.flushPendingSave();
    } catch (error) {
      this._logger.warn({ event: 'lifecycle.flush-failed', error: String(error?.message || error) });
    }
    try {
      await this._controller.saveRuntimeStateNow();
    } catch (error) {
      this._logger.warn({ event: 'lifecycle.save-state-failed', error: String(error?.message || error) });
    }
    if (this._platform && this._controller.isPresenting()) {
      try {
        await this._platform.allowSleep();
      } catch {
        // best-effort — allowSleep já trata falhas internamente
      }
    }
  }

  async _handleForeground() {
    const now = this._now();
    this._backgroundedAt = null;
    try {
      await this._controller.resumeFromBackground(now);
    } catch (error) {
      this._logger.warn({ event: 'lifecycle.resume-failed', error: String(error?.message || error) });
    }
    if (this._platform && this._controller.isPresenting()) {
      try {
        await this._platform.keepAwake();
      } catch {
        // best-effort — keepAwake já trata falhas internamente
      }
    }
  }
}
