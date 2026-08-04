import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoragePort, MediaPort, PresentationAdapter, NotImplementedError, StorageError, StorageErrorCode, MediaError, MediaErrorCode } from '../../www/app/core/ports.js';

test('StoragePort: cada método lança NotImplementedError por padrão', () => {
  const port = new StoragePort();
  for (const method of ['loadPlaylist', 'savePlaylist', 'loadSettings', 'saveSettings', 'loadRuntimeState', 'saveRuntimeState']) {
    assert.throws(() => port[method](), NotImplementedError);
  }
});

test('MediaPort: cada método lança NotImplementedError por padrão', () => {
  const port = new MediaPort();
  for (const method of ['pickMedia', 'importToLibrary', 'resolveSrc', 'deleteFromLibrary']) {
    assert.throws(() => port[method](), NotImplementedError);
  }
});

test('PresentationAdapter: cada método lança NotImplementedError por padrão', () => {
  const adapter = new PresentationAdapter();
  for (const method of ['show', 'blackout', 'logo', 'pause', 'resume', 'clear', 'onStatus', 'capabilities']) {
    assert.throws(() => adapter[method](), NotImplementedError);
  }
});

test('mensagem de erro identifica classe e método não implementados', () => {
  const port = new StoragePort();
  assert.throws(() => port.loadPlaylist(), /StoragePort\.loadPlaylist\(\) não implementado/);
});

test('subclasses podem sobrescrever métodos individualmente sem afetar os demais', () => {
  class PartialStorage extends StoragePort {
    loadPlaylist() {
      return [];
    }
  }
  const port = new PartialStorage();
  assert.deepEqual(port.loadPlaylist(), []);
  assert.throws(() => port.savePlaylist([]), NotImplementedError);
});

test('contratos não importam Capacitor: instâncias funcionam isoladamente em Node puro', () => {
  assert.ok(new StoragePort() instanceof StoragePort);
  assert.ok(new MediaPort() instanceof MediaPort);
  assert.ok(new PresentationAdapter() instanceof PresentationAdapter);
});

test('StorageErrorCode expõe códigos estáveis para diferenciar falhas de uma StoragePort', () => {
  assert.deepEqual(Object.keys(StorageErrorCode).sort(), [
    'CORRUPTED_JSON',
    'INVALID_MODEL',
    'NOT_FOUND',
    'PREFERENCES_FAILED',
    'READ_FAILED',
    'WRITE_FAILED',
  ]);
  assert.ok(Object.isFrozen(StorageErrorCode));
});

test('StorageError carrega code, message e cause (para diferenciar erros sem comparar texto)', () => {
  const cause = new Error('falha original');
  const error = new StorageError(StorageErrorCode.READ_FAILED, 'Falha ao ler arquivo', { cause });
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'StorageError');
  assert.equal(error.code, StorageErrorCode.READ_FAILED);
  assert.equal(error.message, 'Falha ao ler arquivo');
  assert.equal(error.cause, cause);
});

test('StorageError funciona sem cause (cause é opcional)', () => {
  const error = new StorageError(StorageErrorCode.INVALID_MODEL, 'modelo inválido');
  assert.equal(error.code, StorageErrorCode.INVALID_MODEL);
  assert.equal('cause' in error, false);
});

test('MediaErrorCode expõe códigos estáveis para diferenciar falhas de uma MediaPort', () => {
  assert.deepEqual(Object.keys(MediaErrorCode).sort(), [
    'CANCELED',
    'COPY_FAILED',
    'DELETE_FAILED',
    'INVALID_REF',
    'PICK_FAILED',
    'UNSUPPORTED_TYPE',
  ]);
  assert.ok(Object.isFrozen(MediaErrorCode));
});

test('MediaError carrega code, message e cause', () => {
  const cause = new Error('falha original do picker');
  const error = new MediaError(MediaErrorCode.PICK_FAILED, 'Falha ao abrir o seletor', { cause });
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'MediaError');
  assert.equal(error.code, MediaErrorCode.PICK_FAILED);
  assert.equal(error.cause, cause);
});
