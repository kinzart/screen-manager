// Implementação de PresentationAdapter que controla uma TV remota (aberta
// no navegador dela em `remote/public/display.html`, servida por
// `remote/server.js`) via WebSocket, em vez de apresentar na tela do
// próprio celular (ver LocalPresentationAdapter.js — MESMO contrato).
//
// Fluxo de show(item): resolve o Blob real da mídia via MediaPort.readBlob,
// faz upload para o servidor de retransmissão (uma vez por item — cache
// local por relPath), e só então envia o comando "show" com a URL pública
// do arquivo já hospedado, para o display renderizar.
//
// Nunca importa Capacitor. Nunca assume que o servidor está na mesma rede
// local — serverUrl pode ser qualquer origem (inclusive https:// hospedada
// na nuvem).

import { PresentationAdapter } from '../core/ports.js';

const DEFAULT_LOGGER = {
  warn(payload) {
    try {
      console.warn('[RemoteDesktopAdapter]', JSON.stringify(payload));
    } catch {
      console.warn('[RemoteDesktopAdapter]', payload);
    }
  },
};

function wsUrlFor(serverUrl, room, token = '') {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = `?role=controller&room=${encodeURIComponent(room)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  return url.toString();
}

export class RemoteDesktopAdapter extends PresentationAdapter {
  /**
   * @param {object} deps
   * @param {string} deps.serverUrl - ex.: "https://fbs-remote.exemplo.com" (sem barra final).
   * @param {string} deps.room - código de 4 dígitos mostrado na TV.
   * @param {string} [deps.token] - token opcional do controlador em relay seguro.
   * @param {import('../core/ports.js').MediaPort} deps.media - usado para readBlob(mediaRef).
   * @param {(WebSocket: typeof WebSocket)} [deps.WebSocketImpl] - injeção para testes; default: WebSocket global.
   * @param {typeof fetch} [deps.fetchImpl] - injeção para testes; default: fetch global.
   * @param {{warn:(payload:object)=>void}} [deps.logger]
   */
  constructor({ serverUrl, room, token = '', media, WebSocketImpl, fetchImpl, logger } = {}) {
    super();
    if (!serverUrl) throw new Error('RemoteDesktopAdapter: "serverUrl" é obrigatório');
    if (!room) throw new Error('RemoteDesktopAdapter: "room" é obrigatório');
    if (!media) throw new Error('RemoteDesktopAdapter: "media" é obrigatório');
    this._serverUrl = serverUrl.replace(/\/$/, '');
    this._room = room;
    this._token = String(token || '').trim();
    this._media = media;
    this._WebSocket = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    if (!this._WebSocket) throw new Error('RemoteDesktopAdapter: WebSocket indisponível neste ambiente e nenhum WebSocketImpl foi injetado');
    this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
    if (!this._fetch) throw new Error('RemoteDesktopAdapter: fetch indisponível neste ambiente e nenhum fetchImpl foi injetado');
    this._logger = logger || DEFAULT_LOGGER;
    this._statusHandlers = [];
    this._uploadedByRelPath = new Map(); // relPath -> mediaUrl (evita reenviar o mesmo arquivo)
    this._ws = null;
    this._connectPromise = null;
    this._connect();
  }

  _connect() {
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = new Promise((resolve, reject) => {
      const ws = new this._WebSocket(wsUrlFor(this._serverUrl, this._room, this._token));
      this._ws = ws;
      ws.addEventListener('open', () => resolve(ws));
      ws.addEventListener('error', (event) => {
        this._logger.warn({ event: 'remote.ws-error', error: String(event?.message || 'erro de conexão') });
        reject(new Error('Não foi possível conectar ao servidor de controle remoto'));
      });
      ws.addEventListener('message', (event) => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (payload.type === 'status' && payload.error) this._emitStatus({ error: payload.error });
        else if (payload.type === 'display-disconnected') this._emitStatus({ error: 'A TV desconectou do controle remoto.' });
      });
      ws.addEventListener('close', () => { this._ws = null; this._connectPromise = null; });
    });
    return this._connectPromise;
  }

  _emitStatus(status) {
    this._statusHandlers.forEach((cb) => cb(status));
  }

  async _send(payload) {
    const ws = await this._connect();
    ws.send(JSON.stringify(payload));
  }

  /** Garante que a mídia do item já está hospedada no servidor de retransmissão; devolve a URL pública. */
  async _ensureUploaded(item) {
    const relPath = item.media?.relPath;
    if (relPath && this._uploadedByRelPath.has(relPath)) {
      return this._uploadedByRelPath.get(relPath);
    }
    const blob = await this._media.readBlob(item.media);
    const uploadUrl = `${this._serverUrl}/api/rooms/${this._room}/media`;
    const response = await this._fetch(uploadUrl, {
      method: 'POST',
      headers: { 'X-Media-Mime': item.media.mime, ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}) },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Falha ao enviar mídia para o controle remoto (HTTP ${response.status})`);
    }
    const data = await response.json();
    const mediaUrl = `${this._serverUrl}${data.url}`;
    if (relPath) this._uploadedByRelPath.set(relPath, mediaUrl);
    return mediaUrl;
  }

  async show(item) {
    try {
      const mediaUrl = await this._ensureUploaded(item);
      await this._send({
        action: 'show',
        item: { name: item.name, type: item.type, fit: item.fit, transition: item.transition, duration: item.duration, mediaUrl },
      });
    } catch (error) {
      const message = `Não foi possível enviar "${item?.name || 'a mídia'}" para a TV: ${String(error?.message || error)}`;
      this._logger.warn({ event: 'remote.show-failed', error: message });
      this._emitStatus({ error: message });
    }
  }

  async blackout() {
    await this._send({ action: 'blackout' });
  }

  async logo() {
    await this._send({ action: 'logo' });
  }

  async pause() {
    await this._send({ action: 'pause' });
  }

  async resume() {
    await this._send({ action: 'resume' });
  }

  async clear() {
    await this._send({ action: 'clear' });
  }

  onStatus(callback) {
    if (typeof callback === 'function') this._statusHandlers.push(callback);
  }

  /** v1: sem fullscreen/segundo monitor local (a TV é quem apresenta) — sempre "remote". */
  capabilities() {
    return { fullscreen: false, remote: true, secondScreen: true };
  }

  /** Encerra a conexão com o servidor de retransmissão (ex.: ao desativar o modo remoto). */
  disconnect() {
    this._ws?.close();
    this._ws = null;
    this._connectPromise = null;
  }
}
