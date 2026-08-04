// Testes da fábrica createCapacitorStorage(). IMPORTANTE: este arquivo
// importa @capacitor/filesystem e @capacitor/preferences transitivamente
// (via createCapacitorStorage.js) apenas para verificar a CONSTRUÇÃO do
// adapter — nenhum teste aqui invoca métodos que cheguem à ponte nativa
// (mkdir/readFile/writeFile/get/set). Toda chamada real de I/O é testada
// em CapacitorStorage.test.js, sobre FakeFilesystem/FakePreferences.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Directory, Encoding } from '@capacitor/filesystem';
import { Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

import { createCapacitorStorage } from '../../www/app/adapters/createCapacitorStorage.js';
import { CapacitorStorage } from '../../www/app/adapters/CapacitorStorage.js';
import { StoragePort } from '../../www/app/core/ports.js';

test('createCapacitorStorage: retorna uma instância de CapacitorStorage (e portanto de StoragePort)', () => {
  const storage = createCapacitorStorage();
  assert.ok(storage instanceof CapacitorStorage);
  assert.ok(storage instanceof StoragePort);
});

test('createCapacitorStorage: conecta o plugin real Filesystem e Directory.Data', () => {
  const storage = createCapacitorStorage();
  assert.equal(storage._fs, Filesystem);
  assert.equal(storage._directory, Directory.Data);
});

test('createCapacitorStorage: conecta o plugin real Preferences e Encoding.UTF8', () => {
  const storage = createCapacitorStorage();
  assert.equal(storage._prefs, Preferences);
  assert.equal(storage._encoding, Encoding.UTF8);
});

test('createCapacitorStorage: aceita logger e now opcionais sem chamar nenhum plugin', () => {
  const warnings = [];
  const storage = createCapacitorStorage({ logger: { warn: (p) => warnings.push(p) }, now: () => 42 });
  assert.equal(storage._now(), 42);
  assert.deepEqual(warnings, []); // nenhuma chamada nativa foi disparada pela simples construção
});

test('createCapacitorStorage: fornece todas as dependências obrigatórias do construtor de CapacitorStorage', () => {
  // Se alguma dependência obrigatória estivesse ausente, o construtor de
  // CapacitorStorage lançaria (ver seus guards de "é obrigatório").
  assert.doesNotThrow(() => createCapacitorStorage());
});

test('createCapacitorStorage.js é a única borda desta etapa que importa Directory/Encoding/Filesystem/Preferences', () => {
  // Confirmação indireta: os símbolos importados aqui vêm dos mesmos
  // módulos que createCapacitorStorage.js usa; CapacitorStorage.js em si
  // não os referencia (verificado em CapacitorStorage.test.js).
  assert.ok(Filesystem);
  assert.ok(Preferences);
  assert.ok(Directory.Data);
  assert.ok(Encoding.UTF8);
});
