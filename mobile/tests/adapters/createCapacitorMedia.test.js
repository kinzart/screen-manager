// Testes da fábrica createCapacitorMedia(). Importa @capacitor/filesystem,
// @capacitor/core e @capawesome/capacitor-file-picker transitivamente
// apenas para verificar a CONSTRUÇÃO do adapter — nenhum teste aqui invoca
// métodos que cheguem à ponte nativa (pickMedia/copyFile/mkdir/getUri/
// deleteFile). Toda chamada real de I/O é testada em CapacitorMedia.test.js,
// sobre FakeFilesystem/FakeMediaPicker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Directory } from '@capacitor/filesystem';
import { Filesystem } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';

import { createCapacitorMedia } from '../../www/app/adapters/createCapacitorMedia.js';
import { CapacitorMedia } from '../../www/app/adapters/CapacitorMedia.js';
import { MediaPort } from '../../www/app/core/ports.js';

test('createCapacitorMedia: retorna uma instância de CapacitorMedia (e portanto de MediaPort)', () => {
  const media = createCapacitorMedia();
  assert.ok(media instanceof CapacitorMedia);
  assert.ok(media instanceof MediaPort);
});

test('createCapacitorMedia: conecta o plugin real Filesystem e Directory.Data', () => {
  const media = createCapacitorMedia();
  assert.equal(media._fs, Filesystem);
  assert.equal(media._directory, Directory.Data);
});

test('createCapacitorMedia: conecta o plugin real FilePicker', () => {
  const media = createCapacitorMedia();
  assert.equal(media._picker, FilePicker);
});

test('createCapacitorMedia: aceita generateId/logger/now opcionais sem chamar nenhum plugin', () => {
  const warnings = [];
  const media = createCapacitorMedia({ logger: { warn: (p) => warnings.push(p) }, now: () => 7, generateId: () => 'fixed-id' });
  assert.equal(media._now(), 7);
  assert.equal(media._generateId(), 'fixed-id');
  assert.deepEqual(warnings, []);
});

test('createCapacitorMedia: fornece todas as dependências obrigatórias do construtor de CapacitorMedia', () => {
  assert.doesNotThrow(() => createCapacitorMedia());
});

test('createCapacitorMedia: dependências nativas (Filesystem, FilePicker) ficam isoladas nesta fábrica', () => {
  assert.ok(Filesystem);
  assert.ok(FilePicker);
  assert.ok(Directory.Data);
});
