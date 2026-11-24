'use strict';

const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const { StudioError } = require('./store');
const { assertOrigin, cookie, digest, equal, issueCookie, json, readJson } = require('./http-utils');

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const PAIRING_MS = 5 * 60 * 1000;
// Bloqueio global de login: com um PIN de 6 números, o limite por IP não basta (IPs podem variar).
// Depois de LOGIN_FAILURE_LIMIT senhas erradas na janela, ninguém entra até a janela acabar;
// sessões já abertas continuam valendo.
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const COOKIE_NAMES = { operator: 'fbs_operator', screen: 'fbs_screen' };
const SECRET_PATTERN = /^[0-9a-f]{64}$/;

// Próximo nome livre no formato "FBS N" dentro do espaço.
function nextScreenName(db, spaceId) {
  const used = new Set(Object.values(db.screens).filter(node => node.spaceId === spaceId).map(node => node.name.trim().toLowerCase()));
  let n = 1;
  while (used.has(`fbs ${n}`)) n += 1;
  return `FBS ${n}`;
}

function nameForScreen(value, fallback) {
  if (value === undefined) return fallback;
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new StudioError(400, 'Use um nome de tela com 1 a 80 caracteres.');
  }
  return name;
}

function prune(db, now) {
  for (const session of Object.values(db.sessions)) {
    if (session.expiresAt <= now) delete db.sessions[session.id];
  }
  for (const pairing of Object.values(db.pairings)) {
    if (pairing.expiresAt <= now - PAIRING_MS) delete db.pairings[pairing.id];
  }
}

function makeSession(role, screenId, now) {
  const secret = randomBytes(32).toString('hex');
  const session = {
    id: randomUUID(), role, screenId, secretHash: digest(secret),
    csrf: randomBytes(32).toString('hex'), expiresAt: now + SESSION_SECONDS * 1000,
  };
  return { session, secret };
}

function pairingWithChallenge(db, id, challenge) {
  const pairing = Object.hasOwn(db.pairings, id) ? db.pairings[id] : undefined;
  if (!pairing || typeof challenge !== 'string' || !SECRET_PATTERN.test(challenge)
      || !equal(digest(challenge), pairing.challengeHash)) {
    throw new StudioError(403, 'Desafio de pareamento inválido.');
  }
  return pairing;
}

function createSessions({ store, publicOrigin, secureCookies }) {
  const attempts = { login: new Map(), pairing: new Map() };
  let loginFailures = [];

  function rateLimit(req, action, limit, windowMs) {
    const entries = attempts[action];
    const now = store.now();
    const ip = req.socket.remoteAddress || 'local';
    for (const [key, entry] of entries) {
      if (entry.until <= now) entries.delete(key);
    }
    const entry = entries.get(ip);
    if ((entry && entry.count >= limit) || (!entry && entries.size >= 1024)) {
      throw new StudioError(429, 'Muitas tentativas. Aguarde e tente novamente.');
    }
    if (entry) entry.count += 1;
    else entries.set(ip, { count: 1, until: now + windowMs });
  }

  function authorize(req, role = 'operator', db = store.db) {
    const cookieName = COOKIE_NAMES[role];
    const secret = typeof cookieName === 'string' ? cookie(req, cookieName) : undefined;
    if (typeof secret === 'string' && SECRET_PATTERN.test(secret)) {
      const hash = digest(secret);
      const now = store.now();
      const session = Object.values(db.sessions).find(candidate => candidate.role === role
        && candidate.expiresAt > now && equal(hash, candidate.secretHash));
      if (session && (role !== 'screen' || Object.hasOwn(db.screens, session.screenId))) return session;
    }
    throw new StudioError(401, 'Entre para continuar.');
  }

  function csrf(req, session) {
    assertOrigin(req, publicOrigin);
    const provided = req.headers['x-fbs-csrf'];
    if (typeof provided !== 'string' || !session || !equal(provided, session.csrf)) {
      throw new StudioError(403, 'Token CSRF inválido.');
    }
  }

  async function handle(req, res, url) {
    const { pathname, searchParams } = url;
    const method = req.method;
    const role = searchParams.get('role') === 'screen' ? 'screen' : 'operator';

    if (method === 'POST' && pathname === '/api/v1/login') {
      assertOrigin(req, publicOrigin);
      rateLimit(req, 'login', 20, PAIRING_MS);
      const started = store.now();
      loginFailures = loginFailures.filter(at => at > started - LOGIN_FAILURE_WINDOW_MS);
      if (loginFailures.length >= LOGIN_FAILURE_LIMIT) {
        throw new StudioError(429, 'Muitas senhas erradas. O acesso foi bloqueado por 15 minutos.');
      }
      const { password } = await readJson(req);
      if (typeof password !== 'string' || !equal(digest(password), digest(store.password))) {
        loginFailures.push(started);
        throw new StudioError(401, 'Senha inválida.');
      }
      const { session, secret } = await store.change(db => {
        const now = store.now();
        prune(db, now);
        const created = makeSession('operator', null, now);
        db.sessions[created.session.id] = created.session;
        return created;
      });
      issueCookie(res, COOKIE_NAMES.operator, secret, secureCookies, SESSION_SECONDS);
      json(res, 200, { role: session.role, csrf: session.csrf });
      return true;
    }

    if (method === 'GET' && pathname === '/api/v1/me') {
      let session;
      try {
        session = authorize(req, role);
      } catch (error) {
        if (!(error instanceof StudioError) || error.status !== 401) throw error;
        json(res, 200, { authenticated: false });
        return true;
      }
      const info = { authenticated: true, role, csrf: session.csrf };
      if (role === 'screen') info.screenId = session.screenId;
      else info.spaces = Object.values(store.db.spaces);
      json(res, 200, info);
      return true;
    }

    if (method === 'POST' && pathname === '/api/v1/logout') {
      const session = authorize(req, role);
      csrf(req, session);
      await store.change(db => {
        prune(db, store.now());
        delete db.sessions[session.id];
      });
      issueCookie(res, COOKIE_NAMES[role], '', secureCookies, 0);
      json(res, 200, { ok: true });
      return true;
    }

    if (method === 'POST' && pathname === '/api/v1/pairing') {
      assertOrigin(req, publicOrigin);
      rateLimit(req, 'pairing', 10, 60 * 1000);
      const { name } = await readJson(req);
      const screenName = nameForScreen(name, 'Tela');
      const challenge = randomBytes(32).toString('hex');
      const pairing = await store.change(db => {
        const now = store.now();
        prune(db, now);
        const codes = new Set(Object.values(db.pairings)
          .filter(entry => !entry.claimed && entry.expiresAt > now).map(entry => entry.code));
        if (codes.size >= 100) throw new StudioError(429, 'Limite de pareamentos ativos atingido.');
        let code;
        do {
          code = String(randomInt(1000000)).padStart(6, '0');
        } while (codes.has(code));
        const entry = {
          id: randomUUID(), code, challengeHash: digest(challenge), name: screenName,
          expiresAt: now + PAIRING_MS, screenId: null, claimed: false,
        };
        db.pairings[entry.id] = entry;
        return entry;
      });
      json(res, 201, { id: pairing.id, code: pairing.code, challenge, expiresAt: pairing.expiresAt });
      return true;
    }

    const pairingPath = /^\/api\/v1\/pairing\/([^/]+)(\/claim)?$/.exec(pathname);
    if (method === 'GET' && pairingPath && !pairingPath[2]) {
      const pairing = pairingWithChallenge(store.db, pairingPath[1], req.headers['x-fbs-pairing']);
      let status = 'pending';
      if (pairing.expiresAt <= store.now() || (pairing.screenId && !Object.hasOwn(store.db.screens, pairing.screenId))) {
        status = 'expired';
      } else if (pairing.screenId) status = 'approved';
      json(res, 200, { status, expiresAt: pairing.expiresAt });
      return true;
    }

    if (method === 'POST' && pairingPath?.[2]) {
      assertOrigin(req, publicOrigin);
      const { challenge } = await readJson(req);
      const { session, secret } = await store.change(db => {
        const pairing = pairingWithChallenge(db, pairingPath[1], challenge);
        const now = store.now();
        if (pairing.claimed) throw new StudioError(409, 'Pareamento já utilizado.');
        if (pairing.expiresAt <= now) throw new StudioError(403, 'Pareamento expirado.');
        if (!pairing.screenId || !Object.hasOwn(db.screens, pairing.screenId)) {
          throw new StudioError(409, 'Pareamento ainda não aprovado.');
        }
        prune(db, now);
        const created = makeSession('screen', pairing.screenId, now);
        db.sessions[created.session.id] = created.session;
        pairing.claimed = true;
        return created;
      });
      issueCookie(res, COOKIE_NAMES.screen, secret, secureCookies, SESSION_SECONDS);
      json(res, 200, { role: session.role, csrf: session.csrf, screenId: session.screenId });
      return true;
    }

    const approvalPath = /^\/api\/v1\/spaces\/([^/]+)\/pairings\/([^/]+)\/approve$/.exec(pathname);
    if (method === 'POST' && approvalPath) {
      csrf(req, authorize(req));
      const { name, screenId: existingId } = await readJson(req);
      const [, spaceId, pairingId] = approvalPath;
      const screen = await store.change(db => {
        authorize(req, 'operator', db);
        if (!Object.hasOwn(db.spaces, spaceId)) throw new StudioError(404, 'Espaço não encontrado.');
        const pairing = Object.hasOwn(db.pairings, pairingId) ? db.pairings[pairingId] : undefined;
        const now = store.now();
        if (!pairing || pairing.expiresAt <= now) throw new StudioError(404, 'Pareamento não encontrado ou expirado.');
        if (pairing.screenId || pairing.claimed) throw new StudioError(409, 'Pareamento já aprovado.');
        prune(db, now);
        if (existingId !== undefined) {
          // Troca do aparelho de uma tela existente: mantém programação e rotas; revoga o aparelho anterior.
          const target = typeof existingId === 'string' && Object.hasOwn(db.screens, existingId) ? db.screens[existingId] : null;
          if (!target || target.spaceId !== spaceId) throw new StudioError(404, 'Tela não encontrada neste espaço.');
          for (const session of Object.values(db.sessions)) {
            if (session.role === 'screen' && session.screenId === target.id) delete db.sessions[session.id];
          }
          if (target.device) target.device = { ...target.device, revokedAt: now };
          target.version += 1;
          pairing.screenId = target.id;
          return target;
        }
        const count = Object.values(db.screens).filter(node => node.spaceId === spaceId).length;
        const screenName = typeof name === 'string' && name.trim() ? nameForScreen(name, '') : nextScreenName(db, spaceId);
        const taken = Object.values(db.screens).some(node => node.spaceId === spaceId && node.name.trim().toLowerCase() === screenName.trim().toLowerCase());
        if (taken) throw new StudioError(409, `Já existe uma tela chamada "${screenName}" neste espaço. Escolha outro nome.`, 'DUPLICATE_NAME');
        const created = {
          id: randomUUID(), spaceId, name: screenName, version: 1,
          routeRevision: 1, input: null, position: { x: 415, y: Math.min(4000, 45 + count * 110) }, createdAt: now,
          program: null, override: null, commands: [], device: null, controlRevision: 0,
        };
        db.screens[created.id] = created;
        pairing.screenId = created.id;
        return created;
      });
      json(res, 201, screen);
      return true;
    }

    return false;
  }

  function close() {
    attempts.login.clear();
    attempts.pairing.clear();
    loginFailures = [];
  }

  return { handle, authorize, csrf, close };
}

module.exports = { createSessions };
