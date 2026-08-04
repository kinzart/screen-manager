import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CapacitorMedia, LIBRARY_DIR, MIME_TO_EXT, isCancelError } from '../../www/app/adapters/CapacitorMedia.js';
import { MediaPort, MediaError, MediaErrorCode } from '../../www/app/core/ports.js';
import { validateMediaRef } from '../../www/app/core/models.js';
import { FakeFilesystem } from '../helpers/FakeFilesystem.js';
import { FakeMediaPicker } from '../helpers/FakeMediaPicker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIRECTORY = 'DATA';

function makeMedia({ fs = new FakeFilesystem(), picker = new FakeMediaPicker(), generateId, convertFileSrc } = {}) {
  const warnings = [];
  let counter = 0;
  const media = new CapacitorMedia({
    filesystem: fs,
    filePicker: picker,
    directory: DIRECTORY,
    convertFileSrc: convertFileSrc || ((uri) => `capacitor://${uri}`),
    generateId: generateId || (() => `uid-${++counter}`),
    logger: { warn: (p) => warnings.push(p) },
  });
  return { media, fs, picker, warnings };
}

function pngFile(overrides = {}) {
  return { name: 'foto.png', mimeType: 'image/png', size: 12345, path: '/native/tmp/foto.png', ...overrides };
}

function mp4File(overrides = {}) {
  return { name: 'clipe.mp4', mimeType: 'video/mp4', size: 987654321, path: '/native/tmp/clipe.mp4', ...overrides };
}

// ---------------------------------------------------------------------
// pickMedia
// ---------------------------------------------------------------------

test('pickMedia: cancelamento do picker retorna [] (não lança)', async () => {
  const { media, picker } = makeMedia();
  picker.cancelNextPick();
  const result = await media.pickMedia();
  assert.deepEqual(result, []);
});

test('pickMedia: sempre chama o plugin com readData:false (nunca solicita Base64)', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickResult([pngFile()]);
  await media.pickMedia();
  assert.equal(picker.callsFor('pickMedia')[0].options.readData, false);
});

test('pickMedia: seleciona uma imagem', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickResult([pngFile()]);
  const [file] = await media.pickMedia();
  assert.equal(file.name, 'foto.png');
  assert.equal(file.mimeType, 'image/png');
  assert.equal(file.size, 12345);
});

test('pickMedia: seleciona um vídeo', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickResult([mp4File()]);
  const [file] = await media.pickMedia();
  assert.equal(file.mimeType, 'video/mp4');
});

test('pickMedia: múltiplos arquivos são retornados na ordem do picker', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickResult([pngFile({ name: 'a.png' }), mp4File({ name: 'b.mp4' })]);
  const files = await media.pickMedia();
  assert.deepEqual(files.map((f) => f.name), ['a.png', 'b.mp4']);
});

test('pickMedia: nunca expõe campo "data"/Base64 no resultado', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickResult([{ ...pngFile(), data: 'AAAAQmFzZTY0IGZha2Ugbm90IHVzZWQ=' }]);
  const [file] = await media.pickMedia();
  assert.equal('data' in file, false);
});

test('pickMedia: erro real do picker (não cancelamento) é relançado como PICK_FAILED', async () => {
  const { media, picker } = makeMedia();
  picker.setNextPickError(new Error('falha nativa desconhecida'));
  await assert.rejects(() => media.pickMedia(), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.PICK_FAILED);
    return true;
  });
});

test('isCancelError: reconhece a mensagem real da implementação web do plugin', () => {
  assert.equal(isCancelError(new Error('pickFiles canceled.')), true);
  assert.equal(isCancelError(new Error('falha de permissão')), false);
});

// ---------------------------------------------------------------------
// importToLibrary
// ---------------------------------------------------------------------

test('importToLibrary: tipo não permitido é rejeitado (UNSUPPORTED_TYPE)', async () => {
  const { media, picker } = makeMedia();
  await assert.rejects(
    () => media.importToLibrary({ name: 'doc.pdf', mimeType: 'application/pdf', size: 10, path: '/tmp/doc.pdf' }),
    (error) => {
      assert.ok(error instanceof MediaError);
      assert.equal(error.code, MediaErrorCode.UNSUPPORTED_TYPE);
      return true;
    },
  );
  assert.equal(picker.callsFor('copyFile').length, 0);
});

test('importToLibrary: MIME ausente com extensão reconhecida é aceito via fallback pelo nome', async () => {
  const { media, fs } = makeMedia();
  const ref = await media.importToLibrary({ name: 'video.mp4', mimeType: undefined, size: 500, path: '/tmp/video.mp4' });
  assert.equal(ref.mime, 'video/mp4');
  assert.equal(fs.callsFor('mkdir').length, 1);
});

test('importToLibrary: extensão inválida (sem MIME e sem extensão reconhecida) é rejeitada', async () => {
  const { media } = makeMedia();
  await assert.rejects(
    () => media.importToLibrary({ name: 'arquivo-sem-extensao', mimeType: '', size: 10, path: '/tmp/x' }),
    (error) => {
      assert.equal(error.code, MediaErrorCode.UNSUPPORTED_TYPE);
      return true;
    },
  );
});

test('importToLibrary: produz uma MediaRef correta e válida', async () => {
  const { media } = makeMedia();
  const ref = await media.importToLibrary(pngFile());
  assert.equal(ref.storage, 'sandbox');
  assert.match(ref.relPath, /^library\/uid-1\.png$/);
  assert.equal(ref.mime, 'image/png');
  assert.equal(ref.bytes, 12345);
  assert.doesNotThrow(() => validateMediaRef(ref));
});

test('importToLibrary: UIDs gerados não colidem entre importações sucessivas', async () => {
  const { media } = makeMedia();
  const first = await media.importToLibrary(pngFile());
  const second = await media.importToLibrary(pngFile({ name: 'outra.png' }));
  assert.notEqual(first.relPath, second.relPath);
});

test('importToLibrary: cria library/ recursivamente antes de copiar', async () => {
  const { media, fs } = makeMedia();
  await media.importToLibrary(pngFile());
  const mkdirCall = fs.callsFor('mkdir')[0];
  assert.equal(mkdirCall.options.path, LIBRARY_DIR);
  assert.equal(mkdirCall.options.directory, DIRECTORY);
  assert.equal(mkdirCall.options.recursive, true);
});

test('importToLibrary: cópia concluída chama FilePicker.copyFile com from/to corretos, sem overwrite', async () => {
  const { media, picker } = makeMedia();
  const ref = await media.importToLibrary(pngFile());
  const copyCall = picker.callsFor('copyFile')[0];
  assert.equal(copyCall.options.from, '/native/tmp/foto.png');
  assert.match(copyCall.options.to, new RegExp(ref.relPath.replace('/', '\\/') + '$'));
  assert.equal(copyCall.options.overwrite, false);
});

test('importToLibrary: falha de cópia é relançada como COPY_FAILED', async () => {
  const { media, picker } = makeMedia();
  picker.setNextCopyError(new Error('falha nativa de cópia'));
  await assert.rejects(() => media.importToLibrary(pngFile()), (error) => {
    assert.ok(error instanceof MediaError);
    assert.equal(error.code, MediaErrorCode.COPY_FAILED);
    return true;
  });
});

test('importToLibrary: em falha de cópia, tenta limpar o arquivo parcial no destino', async () => {
  const { media, fs, picker } = makeMedia();
  picker.setNextCopyError(new Error('disco cheio no meio da cópia'));
  await assert.rejects(() => media.importToLibrary(pngFile()));
  assert.equal(fs.callsFor('deleteFile').length, 1);
});

test('importToLibrary: arquivo grande nunca é convertido integralmente em Base64 (sem campo data, cópia via caminho nativo)', async () => {
  const { media, picker } = makeMedia();
  const bigFile = mp4File({ size: 2 * 1024 * 1024 * 1024 }); // 2 GB
  const ref = await media.importToLibrary(bigFile);
  assert.equal(ref.bytes, 2 * 1024 * 1024 * 1024);
  const copyCall = picker.callsFor('copyFile')[0];
  assert.equal('data' in copyCall.options, false);
  assert.equal(typeof copyCall.options.from, 'string');
  assert.equal(typeof copyCall.options.to, 'string');
});

// ---------------------------------------------------------------------
// resolveSrc
// ---------------------------------------------------------------------

test('resolveSrc: resolve a URI via Filesystem.getUri e aplica convertFileSrc', async () => {
  const { media } = makeMedia();
  const ref = { storage: 'sandbox', relPath: 'library/uid-1.png', mime: 'image/png', bytes: 10 };
  const src = await media.resolveSrc(ref);
  assert.match(src, /^capacitor:\/\//);
  assert.match(src, /library\/uid-1\.png/);
});

test('resolveSrc: rejeita MediaRef fora de library/', async () => {
  const { media } = makeMedia();
  const ref = { storage: 'sandbox', relPath: 'state/settings.json', mime: 'image/png', bytes: 10 };
  await assert.rejects(() => media.resolveSrc(ref), (error) => {
    assert.equal(error.code, MediaErrorCode.INVALID_REF);
    return true;
  });
});

// ---------------------------------------------------------------------
// deleteFromLibrary
// ---------------------------------------------------------------------

test('deleteFromLibrary: remove um arquivo válido dentro de library/', async () => {
  const { media, fs } = makeMedia();
  fs.markAsCopied(DIRECTORY, 'library/uid-1.png', { size: 10 });
  await media.deleteFromLibrary({ storage: 'sandbox', relPath: 'library/uid-1.png', mime: 'image/png', bytes: 10 });
  assert.equal(fs.hasFile(DIRECTORY, 'library/uid-1.png'), false);
});

test('deleteFromLibrary: idempotente quando o arquivo já não existe', async () => {
  const { media } = makeMedia();
  await assert.doesNotReject(() =>
    media.deleteFromLibrary({ storage: 'sandbox', relPath: 'library/ghost.png', mime: 'image/png', bytes: 10 }),
  );
});

test('deleteFromLibrary: bloqueia path traversal (relPath com "..")', async () => {
  const { media } = makeMedia();
  await assert.rejects(
    () => media.deleteFromLibrary({ storage: 'sandbox', relPath: 'library/../state/settings.json', mime: 'image/png', bytes: 10 }),
  );
});

test('deleteFromLibrary: bloqueia MediaRef com caminho absoluto do Windows', async () => {
  const { media } = makeMedia();
  await assert.rejects(() =>
    media.deleteFromLibrary({ storage: 'sandbox', relPath: 'C:\\Users\\foo\\a.png', mime: 'image/png', bytes: 10 }),
  );
});

test('deleteFromLibrary: bloqueia MediaRef com relPath file:///', async () => {
  const { media } = makeMedia();
  await assert.rejects(() =>
    media.deleteFromLibrary({ storage: 'sandbox', relPath: 'file:///C:/a.png', mime: 'image/png', bytes: 10 }),
  );
});

test('deleteFromLibrary: rejeita MediaRef válida porém fora de library/ (ex.: state/)', async () => {
  const { media, fs } = makeMedia();
  fs.markAsCopied(DIRECTORY, 'state/settings.json', { size: 5 });
  await assert.rejects(
    () => media.deleteFromLibrary({ storage: 'sandbox', relPath: 'state/settings.json', mime: 'image/png', bytes: 5 }),
    (error) => {
      assert.equal(error.code, MediaErrorCode.INVALID_REF);
      return true;
    },
  );
  assert.equal(fs.hasFile(DIRECTORY, 'state/settings.json'), true); // não foi apagado
});

test('deleteFromLibrary: erro real de I/O é relançado como DELETE_FAILED', async () => {
  const { media, fs } = makeMedia();
  fs.markAsCopied(DIRECTORY, 'library/uid-1.png', { size: 5 });
  const originalDeleteFile = fs.deleteFile.bind(fs);
  fs.deleteFile = async () => {
    throw new Error('permissão negada');
  };
  await assert.rejects(() =>
    media.deleteFromLibrary({ storage: 'sandbox', relPath: 'library/uid-1.png', mime: 'image/png', bytes: 5 }),
    (error) => {
      assert.equal(error.code, MediaErrorCode.DELETE_FAILED);
      return true;
    },
  );
  fs.deleteFile = originalDeleteFile;
});

// ---------------------------------------------------------------------
// ARQUITETURA
// ---------------------------------------------------------------------

test('CapacitorMedia implementa integralmente a MediaPort', () => {
  const { media } = makeMedia();
  assert.ok(media instanceof MediaPort);
  for (const method of ['pickMedia', 'importToLibrary', 'resolveSrc', 'deleteFromLibrary']) {
    assert.notEqual(media[method], MediaPort.prototype[method]);
  }
});

test('CapacitorMedia.js não importa @capacitor/*, @capawesome/* nem electron diretamente', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/CapacitorMedia.js'), 'utf8');
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capawesome\//);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/);
});

test('createCapacitorMedia.js concentra os imports de @capacitor/* e @capawesome/capacitor-file-picker', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/createCapacitorMedia.js'), 'utf8');
  assert.match(source, /from\s+['"]@capacitor\/filesystem['"]/);
  assert.match(source, /from\s+['"]@capacitor\/core['"]/);
  assert.match(source, /from\s+['"]@capawesome\/capacitor-file-picker['"]/);
});

test('mobile/www/app/core/** continua sem import/require executável de @capacitor/*, @capawesome/* ou electron', () => {
  const coreFiles = ['models.js', 'PlaylistManager.js', 'PlaybackEngine.js', 'ScheduleEngine.js', 'transitions.js', 'ports.js'];
  for (const file of coreFiles) {
    const source = readFileSync(path.resolve(__dirname, '../../www/app/core', file), 'utf8');
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//, file);
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capawesome\//, file);
    assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/, file);
  }
});

test('MIME_TO_EXT cobre exatamente o conjunto suportado pelo desktop (main.js SUPPORTED)', () => {
  assert.deepEqual(Object.keys(MIME_TO_EXT).sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);
});
