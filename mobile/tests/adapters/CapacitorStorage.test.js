import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  CapacitorStorage,
  STATE_DIR,
  PLAYLIST_PATH,
  SETTINGS_PATH,
  RUNTIME_STATE_KEY,
  DEFAULT_SETTINGS,
  isNotFoundError,
} from '../../www/app/adapters/CapacitorStorage.js';
import { StoragePort, StorageError, StorageErrorCode } from '../../www/app/core/ports.js';
import { FakeFilesystem } from '../helpers/FakeFilesystem.js';
import { FakePreferences } from '../helpers/FakePreferences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIRECTORY = 'DATA'; // equivalente de Directory.Data no teste
const ENCODING = 'utf8'; // equivalente de Encoding.UTF8 no teste

function makeMediaRef(overrides = {}) {
  return { storage: 'sandbox', relPath: 'library/a.jpg', mime: 'image/jpeg', bytes: 100, ...overrides };
}

function makeItem(id, overrides = {}) {
  return {
    id,
    media: makeMediaRef({ relPath: `library/${id}.jpg` }),
    name: `${id}.jpg`,
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

function makeRuntimeState(overrides = {}) {
  return {
    currentItemId: 'a',
    elapsed: 3.5,
    isPlaying: true,
    locked: false,
    blackout: false,
    presenting: true,
    ...overrides,
  };
}

function makeStorage({ fs = new FakeFilesystem(), prefs = new FakePreferences() } = {}) {
  const warnings = [];
  const logger = { warn: (payload) => warnings.push(payload) };
  const storage = new CapacitorStorage({ filesystem: fs, preferences: prefs, directory: DIRECTORY, encoding: ENCODING, logger });
  return { storage, fs, prefs, warnings };
}

// ---------------------------------------------------------------------
// PLAYLIST
// ---------------------------------------------------------------------

test('loadPlaylist: arquivo ausente retorna []', async () => {
  const { storage } = makeStorage();
  assert.deepEqual(await storage.loadPlaylist(), []);
});

test('savePlaylist + loadPlaylist: round-trip', async () => {
  const { storage } = makeStorage();
  const items = [makeItem('a'), makeItem('b')];
  await storage.savePlaylist(items);
  const loaded = await storage.loadPlaylist();
  assert.deepEqual(loaded, items);
});

test('loadPlaylist: preserva a ordem dos itens', async () => {
  const { storage } = makeStorage();
  const items = [makeItem('c'), makeItem('a'), makeItem('b')];
  await storage.savePlaylist(items);
  const loaded = await storage.loadPlaylist();
  assert.deepEqual(loaded.map((i) => i.id), ['c', 'a', 'b']);
});

test('savePlaylist: playlist inválida (não-array) é rejeitada antes de qualquer escrita', async () => {
  const { storage, fs } = makeStorage();
  await assert.rejects(() => storage.savePlaylist('not-an-array'), StorageError);
  assert.equal(fs.callsFor('writeFile').length, 0);
  assert.equal(fs.callsFor('mkdir').length, 0);
});

test('savePlaylist: item com caminho absoluto do Windows é rejeitado', async () => {
  const { storage, fs } = makeStorage();
  const items = [makeItem('a', { media: makeMediaRef({ relPath: 'C:\\Users\\foo\\video.mp4' }) })];
  await assert.rejects(() => storage.savePlaylist(items), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.INVALID_MODEL);
    return true;
  });
  assert.equal(fs.callsFor('writeFile').length, 0);
});

test('savePlaylist: item com relPath file:/// é rejeitado', async () => {
  const { storage, fs } = makeStorage();
  const items = [makeItem('a', { media: makeMediaRef({ relPath: 'file:///C:/Users/foo/video.mp4' }) })];
  await assert.rejects(() => storage.savePlaylist(items), StorageError);
  assert.equal(fs.callsFor('writeFile').length, 0);
});

test('loadPlaylist: JSON malformado usa fallback [] e registra warning estruturado', async () => {
  const { storage, fs, warnings } = makeStorage();
  fs.seedFile(DIRECTORY, PLAYLIST_PATH, '{ isto não é json válido ');
  const loaded = await storage.loadPlaylist();
  assert.deepEqual(loaded, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].reason, 'corrupted-json');
  assert.equal(warnings[0].path, PLAYLIST_PATH);
  // não sobrescreve o arquivo corrompido durante o load
  assert.equal(fs.callsFor('writeFile').length, 0);
});

test('loadPlaylist: modelo inválido (JSON válido, PlaylistItem inválido) usa fallback [] e warning', async () => {
  const { storage, fs, warnings } = makeStorage();
  fs.seedFile(DIRECTORY, PLAYLIST_PATH, JSON.stringify([{ id: 'a', type: 'audio' }]));
  const loaded = await storage.loadPlaylist();
  assert.deepEqual(loaded, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].reason, 'invalid-model');
  assert.equal(fs.callsFor('writeFile').length, 0);
});

test('loadPlaylist: erro de leitura não relacionado a "not found" é lançado, não confundido com arquivo ausente', async () => {
  const { storage, fs } = makeStorage();
  fs.failNextRead(PLAYLIST_PATH, new Error('permissão negada'));
  await assert.rejects(() => storage.loadPlaylist(), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.READ_FAILED);
    assert.equal(error.cause.message, 'permissão negada');
    return true;
  });
});

test('savePlaylist: erro real de escrita é lançado', async () => {
  const { storage, fs } = makeStorage();
  fs.failNextWrite(PLAYLIST_PATH, new Error('disco cheio'));
  await assert.rejects(() => storage.savePlaylist([makeItem('a')]), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.WRITE_FAILED);
    return true;
  });
});

test('loadPlaylist: retorno não expõe referência mutável ao estado interno', async () => {
  const { storage } = makeStorage();
  await storage.savePlaylist([makeItem('a')]);
  const first = await storage.loadPlaylist();
  first[0].name = 'mutated';
  first.push(makeItem('ghost'));
  const second = await storage.loadPlaylist();
  assert.equal(second.length, 1);
  assert.equal(second[0].name, 'a.jpg');
});

test('playlist: usa UTF-8 e o Directory configurado (Directory.Data) em toda leitura/escrita', async () => {
  const { storage, fs } = makeStorage();
  await storage.savePlaylist([makeItem('a')]);
  await storage.loadPlaylist();
  const writeCall = fs.callsFor('writeFile')[0];
  const readCall = fs.callsFor('readFile')[0];
  assert.equal(writeCall.options.directory, DIRECTORY);
  assert.equal(writeCall.options.encoding, ENCODING);
  assert.equal(readCall.options.directory, DIRECTORY);
  assert.equal(readCall.options.encoding, ENCODING);
});

test('savePlaylist: cria o diretório state/ recursivamente antes de escrever', async () => {
  const { storage, fs } = makeStorage();
  await storage.savePlaylist([makeItem('a')]);
  const mkdirCall = fs.callsFor('mkdir')[0];
  assert.equal(mkdirCall.options.path, STATE_DIR);
  assert.equal(mkdirCall.options.directory, DIRECTORY);
  assert.equal(mkdirCall.options.recursive, true);
});

test('savePlaylist: escritas concorrentes no mesmo arquivo não se sobrepõem nem corrompem o JSON', async () => {
  const { storage, fs } = makeStorage();
  fs.setWriteDelay(15);
  const first = storage.savePlaylist([makeItem('a')]);
  const second = storage.savePlaylist([makeItem('a'), makeItem('b')]);
  await Promise.all([first, second]);
  assert.equal(fs.hadConcurrencyViolation(), false);
  const loaded = await storage.loadPlaylist();
  // a fila garante ordem FIFO: a segunda escrita (mais recente) vence
  assert.deepEqual(loaded.map((i) => i.id), ['a', 'b']);
});

// ---------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------

test('loadSettings: arquivo ausente retorna os defaults', async () => {
  const { storage } = makeStorage();
  assert.deepEqual(await storage.loadSettings(), DEFAULT_SETTINGS);
});

test('saveSettings + loadSettings: round-trip válido', async () => {
  const { storage } = makeStorage();
  const settings = { rules: [{ start: '19:00', end: '20:00', transition: 'fade' }], defaultFit: 'cover', loopPlaylist: false };
  await storage.saveSettings(settings);
  assert.deepEqual(await storage.loadSettings(), settings);
});

test('saveSettings: Settings inválido é rejeitado antes da escrita', async () => {
  const { storage, fs } = makeStorage();
  await assert.rejects(() => storage.saveSettings({ rules: [], defaultFit: 'contain', loopPlaylist: 'sim' }), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.INVALID_MODEL);
    return true;
  });
  assert.equal(fs.callsFor('writeFile').length, 0);
});

test('loadSettings: JSON malformado usa fallback de defaults e registra warning', async () => {
  const { storage, fs, warnings } = makeStorage();
  fs.seedFile(DIRECTORY, SETTINGS_PATH, 'não é json {{{');
  assert.deepEqual(await storage.loadSettings(), DEFAULT_SETTINGS);
  assert.equal(warnings[0].reason, 'corrupted-json');
});

test('loadSettings: regra de horário inválida não é aceita silenciosamente (fallback + warning)', async () => {
  const { storage, fs, warnings } = makeStorage();
  const invalidSettings = { rules: [{ start: '19:00' }], defaultFit: 'contain', loopPlaylist: true };
  fs.seedFile(DIRECTORY, SETTINGS_PATH, JSON.stringify(invalidSettings));
  const loaded = await storage.loadSettings();
  assert.deepEqual(loaded, DEFAULT_SETTINGS);
  assert.equal(warnings.some((w) => w.reason === 'invalid-model'), true);
});

test('settings: loopPlaylist booleano é preservado em true e em false', async () => {
  const { storage } = makeStorage();
  await storage.saveSettings({ rules: [], defaultFit: 'contain', loopPlaylist: false });
  assert.equal((await storage.loadSettings()).loopPlaylist, false);
  await storage.saveSettings({ rules: [], defaultFit: 'contain', loopPlaylist: true });
  assert.equal((await storage.loadSettings()).loopPlaylist, true);
});

test('loadSettings: retorno é uma cópia defensiva', async () => {
  const { storage } = makeStorage();
  await storage.saveSettings({ rules: [], defaultFit: 'contain', loopPlaylist: true });
  const first = await storage.loadSettings();
  first.loopPlaylist = false;
  first.rules.push({ start: '00:00', end: '01:00', transition: 'cut' });
  const second = await storage.loadSettings();
  assert.equal(second.loopPlaylist, true);
  assert.equal(second.rules.length, 0);
});

// ---------------------------------------------------------------------
// RUNTIME STATE
// ---------------------------------------------------------------------

test('loadRuntimeState: chave ausente retorna null', async () => {
  const { storage } = makeStorage();
  assert.equal(await storage.loadRuntimeState(), null);
});

test('saveRuntimeState + loadRuntimeState: round-trip válido', async () => {
  const { storage } = makeStorage();
  const state = makeRuntimeState();
  await storage.saveRuntimeState(state);
  assert.deepEqual(await storage.loadRuntimeState(), state);
});

test('saveRuntimeState: Preferences recebe somente string como valor', async () => {
  const { storage, prefs } = makeStorage();
  await storage.saveRuntimeState(makeRuntimeState());
  const setCall = prefs.callsFor('set')[0];
  assert.equal(typeof setCall.options.value, 'string');
  assert.doesNotThrow(() => JSON.parse(setCall.options.value));
});

test('saveRuntimeState: estado inválido é rejeitado antes de chamar Preferences.set', async () => {
  const { storage, prefs } = makeStorage();
  await assert.rejects(() => storage.saveRuntimeState({ currentItemId: 'a', elapsed: -1, isPlaying: true, locked: false, blackout: false, presenting: true }), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.INVALID_MODEL);
    return true;
  });
  assert.equal(prefs.callsFor('set').length, 0);
});

test('loadRuntimeState: JSON corrompido retorna null e registra warning', async () => {
  const { storage, prefs, warnings } = makeStorage();
  prefs.seed(RUNTIME_STATE_KEY, '{ corrompido ');
  assert.equal(await storage.loadRuntimeState(), null);
  assert.equal(warnings[0].reason, 'corrupted-json');
});

test('loadRuntimeState: conteúdo estruturalmente inválido (JSON válido, modelo inválido) retorna null e warning', async () => {
  const { storage, prefs, warnings } = makeStorage();
  prefs.seed(RUNTIME_STATE_KEY, JSON.stringify({ currentItemId: 'a' })); // faltam campos obrigatórios
  assert.equal(await storage.loadRuntimeState(), null);
  assert.equal(warnings[0].reason, 'invalid-model');
});

test('RuntimeState: erro real do Preferences é lançado (get e set)', async () => {
  const { storage, prefs } = makeStorage();
  prefs.failNextGet(RUNTIME_STATE_KEY, new Error('falha nativa de leitura'));
  await assert.rejects(() => storage.loadRuntimeState(), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.PREFERENCES_FAILED);
    return true;
  });
  prefs.failNextSet(RUNTIME_STATE_KEY, new Error('falha nativa de escrita'));
  await assert.rejects(() => storage.saveRuntimeState(makeRuntimeState()), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, StorageErrorCode.PREFERENCES_FAILED);
    return true;
  });
});

test('RuntimeState: a chave usada tem namespace e versão ("fbs.mobile.runtimeState.v1")', async () => {
  assert.equal(RUNTIME_STATE_KEY, 'fbs.mobile.runtimeState.v1');
  const { storage, prefs } = makeStorage();
  await storage.saveRuntimeState(makeRuntimeState());
  assert.equal(prefs.callsFor('set')[0].options.key, RUNTIME_STATE_KEY);
});

test('RuntimeState: nenhuma chamada a Preferences.clear() é realizada em nenhum fluxo', async () => {
  const { storage, prefs } = makeStorage();
  await storage.saveRuntimeState(makeRuntimeState());
  await storage.loadRuntimeState();
  prefs.seed(RUNTIME_STATE_KEY, '{ corrompido ');
  await storage.loadRuntimeState();
  assert.equal(prefs.clearCallCount(), 0);
});

test('RuntimeState: playlist e settings nunca são gravados no Preferences', async () => {
  const { storage, prefs } = makeStorage();
  await storage.savePlaylist([makeItem('a')]);
  await storage.saveSettings({ rules: [], defaultFit: 'contain', loopPlaylist: true });
  assert.equal(prefs.calls.length, 0);
});

// ---------------------------------------------------------------------
// isNotFoundError (normalização de erro)
// ---------------------------------------------------------------------

test('isNotFoundError: reconhece a mensagem da implementação web real do plugin', () => {
  assert.equal(isNotFoundError(new Error('File does not exist.')), true);
});

test('isNotFoundError: não trata erros genéricos como "arquivo ausente"', () => {
  assert.equal(isNotFoundError(new Error('permissão negada')), false);
  assert.equal(isNotFoundError(null), false);
  assert.equal(isNotFoundError(undefined), false);
});

// ---------------------------------------------------------------------
// ARQUITETURA
// ---------------------------------------------------------------------

test('CapacitorStorage implementa integralmente a StoragePort (todos os 6 métodos sobrescritos)', () => {
  const { storage } = makeStorage();
  assert.ok(storage instanceof StoragePort);
  for (const method of ['loadPlaylist', 'savePlaylist', 'loadSettings', 'saveSettings', 'loadRuntimeState', 'saveRuntimeState']) {
    assert.notEqual(storage[method], StoragePort.prototype[method], `${method} deveria estar sobrescrito`);
    assert.equal(typeof storage[method], 'function');
  }
});

test('CapacitorStorage.js não importa @capacitor/* nem Electron diretamente (só recebe por injeção)', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/CapacitorStorage.js'), 'utf8');
  // Verifica apenas sintaxe de import/require executável — comentários que
  // MENCIONAM "@capacitor/filesystem" em prosa (ex.: explicando por que
  // este arquivo não importa o plugin) não devem gerar falso positivo.
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/);
});

test('createCapacitorStorage.js é a borda que concentra os imports de @capacitor/filesystem e @capacitor/preferences', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/createCapacitorStorage.js'), 'utf8');
  assert.match(source, /from\s+['"]@capacitor\/filesystem['"]/);
  assert.match(source, /from\s+['"]@capacitor\/preferences['"]/);
});

test('mobile/www/app/core/** continua sem import/require executável de @capacitor/* ou electron', () => {
  const coreFiles = ['models.js', 'PlaylistManager.js', 'PlaybackEngine.js', 'ScheduleEngine.js', 'transitions.js', 'ports.js'];
  for (const file of coreFiles) {
    const source = readFileSync(path.resolve(__dirname, '../../www/app/core', file), 'utf8');
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//, `${file} não deveria importar @capacitor/*`);
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/, `${file} não deveria importar electron`);
  }
});
