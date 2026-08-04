// Testes do MediaPort real usado quando o app roda em navegador puro (sem
// bridge nativo Capacitor) — ver mobile/www/app/adapters/WebMediaAdapter.js.
// `openFilePicker` é injetado para nunca depender de um <input type="file">
// real (impossível de disparar em Node/jsdom) — mesma estratégia de
// injeção de dependência usada em CapacitorMedia.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebMediaAdapter } from '../../www/app/adapters/WebMediaAdapter.js';
import { MediaError, MediaErrorCode } from '../../www/app/core/ports.js';

// Um File real do navegador tem .name/.type/.size e é ele próprio um Blob
// (pode ser passado a URL.createObjectURL). Para os testes, um objeto
// simples com essas três propriedades já basta — o adapter nunca inspeciona
// mais que isso além de repassar o valor a URL.createObjectURL, mockado
// abaixo onde necessário.
function makeFile({ name = 'foto.png', type = 'image/png', size = 1024 } = {}) {
  return { name, type, size };
}

function adapterWithPicker(files) {
  return new WebMediaAdapter({
    openFilePicker: async () => files,
    generateId: (() => { let n = 0; return () => `id${++n}`; })(),
  });
}

test('pickMedia: retorna arquivos escolhidos como PickedFile com _blob', async () => {
  const file = makeFile({ name: 'a.png', type: 'image/png', size: 2048 });
  const adapter = adapterWithPicker([file]);
  const picked = await adapter.pickMedia();
  assert.equal(picked.length, 1);
  assert.equal(picked[0].name, 'a.png');
  assert.equal(picked[0].mimeType, 'image/png');
  assert.equal(picked[0].size, 2048);
  assert.equal(picked[0]._blob, file);
});

test('pickMedia: cancelamento (picker resolve []) não é erro', async () => {
  const adapter = adapterWithPicker([]);
  const picked = await adapter.pickMedia();
  assert.deepEqual(picked, []);
});

test('pickMedia: falha do picker vira MediaError(PICK_FAILED)', async () => {
  const adapter = new WebMediaAdapter({ openFilePicker: async () => { throw new Error('boom'); } });
  await assert.rejects(() => adapter.pickMedia(), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.PICK_FAILED);
    return true;
  });
});

test('importToLibrary: gera MediaRef sandbox válido a partir do Blob em memória', async () => {
  const file = makeFile({ name: 'clipe.mp4', type: 'video/mp4', size: 5000 });
  const adapter = adapterWithPicker([file]);
  const [picked] = await adapter.pickMedia();
  const ref = await adapter.importToLibrary(picked);
  assert.equal(ref.storage, 'sandbox');
  assert.match(ref.relPath, /^library\/id\d+\.mp4$/);
  assert.equal(ref.mime, 'video/mp4');
  assert.equal(ref.bytes, 5000);
});

test('importToLibrary: tipo não suportado (nem image/ nem video/) rejeita com UNSUPPORTED_TYPE', async () => {
  const file = makeFile({ name: 'doc.pdf', type: 'application/pdf', size: 10 });
  const adapter = adapterWithPicker([file]);
  const [picked] = await adapter.pickMedia();
  await assert.rejects(() => adapter.importToLibrary(picked), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.UNSUPPORTED_TYPE);
    return true;
  });
});

test('importToLibrary: pickedFile sem _blob rejeita com INVALID_REF', async () => {
  const adapter = adapterWithPicker([]);
  await assert.rejects(() => adapter.importToLibrary({ name: 'x', mimeType: 'image/png', size: 1 }), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.INVALID_REF);
    return true;
  });
});

test('resolveSrc: mídia importada nesta sessão resolve para uma blob: URL', async () => {
  const originalURL = globalThis.URL;
  const created = [];
  globalThis.URL = Object.assign(Object.create(originalURL), originalURL, {
    createObjectURL: (blob) => { const url = `blob:fake/${created.length}`; created.push({ url, blob }); return url; },
    revokeObjectURL: (url) => { const idx = created.findIndex((e) => e.url === url); if (idx >= 0) created.splice(idx, 1); },
  });
  try {
    const file = makeFile({ name: 'a.png', type: 'image/png', size: 10 });
    const adapter = adapterWithPicker([file]);
    const [picked] = await adapter.pickMedia();
    const ref = await adapter.importToLibrary(picked);
    const src = await adapter.resolveSrc(ref);
    assert.match(src, /^blob:fake\//);
    // chamada repetida reaproveita o mesmo object URL (não recria a cada resolveSrc)
    const src2 = await adapter.resolveSrc(ref);
    assert.equal(src2, src);
  } finally {
    globalThis.URL = originalURL;
  }
});

test('resolveSrc: MediaRef de outra sessão (não importada aqui) rejeita com INVALID_REF', async () => {
  const adapter = adapterWithPicker([]);
  const foreignRef = { storage: 'sandbox', relPath: 'library/outro.png', mime: 'image/png', bytes: 1 };
  await assert.rejects(() => adapter.resolveSrc(foreignRef), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.INVALID_REF);
    return true;
  });
});

test('deleteFromLibrary: remove a entrada em memória; chamar duas vezes é idempotente', async () => {
  const file = makeFile({ name: 'a.png', type: 'image/png', size: 10 });
  const adapter = adapterWithPicker([file]);
  const [picked] = await adapter.pickMedia();
  const ref = await adapter.importToLibrary(picked);
  await adapter.deleteFromLibrary(ref);
  await assert.doesNotReject(() => adapter.deleteFromLibrary(ref));
  await assert.rejects(() => adapter.resolveSrc(ref));
});
