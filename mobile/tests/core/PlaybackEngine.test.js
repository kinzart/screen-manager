import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../../www/app/core/PlaybackEngine.js';

function makeItem(id, overrides = {}) {
  return {
    id,
    media: { storage: 'sandbox', relPath: `library/${id}.jpg`, mime: 'image/jpeg', bytes: 10 },
    name: `${id}.jpg`,
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

function makeClock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (ms) => { t += ms; }, set: (ms) => { t = ms; } };
}

test('start() no item selecionado zera elapsed e marca running', () => {
  const clock = makeClock(1000);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a'), makeItem('b')];
  const item = engine.start(playlist);
  assert.equal(item.id, 'a');
  assert.equal(engine.currentId, 'a');
  assert.equal(engine.running, true);
  assert.equal(engine.paused, false);
  assert.equal(engine.elapsed(), 0);
});

test('start() com playlist vazia é no-op e retorna null', () => {
  const engine = new PlaybackEngine();
  assert.equal(engine.start([]), null);
  assert.equal(engine.running, false);
});

test('elapsed cresce com o relógio enquanto roda (cálculo por timestamp, não por ticks)', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 30 })];
  engine.start(playlist);
  clock.advance(4000);
  assert.equal(engine.elapsed(), 4);
  clock.advance(1500);
  assert.equal(engine.elapsed(), 5.5);
});

test('pause() congela elapsed; resume() retoma do valor pausado', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 30 })];
  engine.start(playlist);
  clock.advance(3000);
  engine.pause();
  assert.equal(engine.paused, true);
  clock.advance(5000); // tempo passa, mas pausado não conta
  assert.equal(engine.elapsed(), 3);
  engine.resume();
  assert.equal(engine.paused, false);
  clock.advance(2000);
  assert.equal(engine.elapsed(), 5);
});

test('toggle() alterna pause/resume e exige start() prévio', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  assert.equal(engine.toggle(), 'start-required');
  engine.start([makeItem('a')]);
  assert.equal(engine.toggle(), 'paused');
  assert.equal(engine.paused, true);
  assert.equal(engine.toggle(), 'resumed');
  assert.equal(engine.paused, false);
});

test('next()/previous() avançam com wraparound', () => {
  const engine = new PlaybackEngine();
  const playlist = [makeItem('a'), makeItem('b'), makeItem('c')];
  engine.start(playlist);
  assert.equal(engine.currentId, 'a');
  engine.next(playlist);
  assert.equal(engine.currentId, 'b');
  engine.next(playlist);
  assert.equal(engine.currentId, 'c');
  engine.next(playlist); // wrap para o início
  assert.equal(engine.currentId, 'a');
  engine.previous(playlist); // wrap para o fim
  assert.equal(engine.currentId, 'c');
});

test('auto-advance por duração (tick) avança para o próximo item', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 5 }), makeItem('b', { duration: 5 })];
  const settings = { loopPlaylist: true };
  engine.start(playlist);
  clock.advance(4000);
  let result = engine.tick(playlist, settings);
  assert.equal(result.action, 'running');
  clock.advance(2000); // total 6s >= duration 5s
  result = engine.tick(playlist, settings);
  assert.equal(result.action, 'advanced');
  assert.equal(engine.currentId, 'b');
  assert.equal(engine.elapsed(), 0);
});

test('loop da playlist: último item avança de volta ao primeiro quando loopPlaylist=true', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 1 }), makeItem('b', { duration: 1 })];
  const settings = { loopPlaylist: true };
  engine.take('b', playlist);
  clock.advance(2000);
  const result = engine.tick(playlist, settings);
  assert.equal(result.action, 'advanced');
  assert.equal(engine.currentId, 'a');
});

test('parada no final quando loopPlaylist=false', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 1 }), makeItem('b', { duration: 1 })];
  const settings = { loopPlaylist: false };
  engine.take('b', playlist);
  clock.advance(2000);
  const result = engine.tick(playlist, settings);
  assert.equal(result.action, 'stopped');
  assert.equal(result.reason, 'end-of-queue');
  assert.equal(engine.running, false);
});

test('item bloqueado (locked) congela no fim da duração em vez de avançar', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 5 }), makeItem('b', { duration: 5 })];
  const settings = { loopPlaylist: true };
  engine.start(playlist);
  engine.locked = true;
  clock.advance(9000);
  const result = engine.tick(playlist, settings);
  assert.equal(result.action, 'locked-at-end');
  assert.equal(engine.currentId, 'a');
  assert.equal(engine.elapsed(), 5);
});

test('tick() em playlist vazia / sem item corrente permanece idle', () => {
  const engine = new PlaybackEngine();
  const result = engine.tick([], { loopPlaylist: true });
  assert.equal(result.action, 'idle');
});

test('item removido durante a reprodução: tick() para o engine em vez de adivinhar o próximo', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 5 }), makeItem('b', { duration: 5 })];
  engine.start(playlist);
  const playlistAfterRemoval = playlist.filter((i) => i.id !== 'a');
  const result = engine.tick(playlistAfterRemoval, { loopPlaylist: true });
  assert.equal(result.action, 'stopped');
  assert.equal(result.reason, 'item-missing');
  assert.equal(engine.running, false);
});

test('duração em segundos: item com duration=0 nunca auto-avança', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 0 })];
  engine.start(playlist);
  clock.advance(60000);
  const result = engine.tick(playlist, { loopPlaylist: true });
  assert.equal(result.action, 'running');
  assert.equal(engine.currentId, 'a');
});

test('snapshot() produz um RuntimeState coerente', () => {
  const clock = makeClock(0);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 30 })];
  engine.start(playlist);
  clock.advance(3000);
  const snap = engine.snapshot();
  assert.equal(snap.currentItemId, 'a');
  assert.equal(snap.elapsed, 3);
  assert.equal(snap.isPlaying, true);
  assert.equal(snap.presenting, true);
  assert.equal(snap.locked, false);
  assert.equal(snap.blackout, false);
});

test('restore() reconstrói o estado a partir de um RuntimeState salvo', () => {
  const clock = makeClock(10_000);
  const engine = new PlaybackEngine({ now: clock.now });
  const playlist = [makeItem('a', { duration: 30 })];
  const state = { currentItemId: 'a', elapsed: 12, isPlaying: true, locked: true, blackout: false, presenting: true };
  engine.restore(state, playlist);
  assert.equal(engine.currentId, 'a');
  assert.equal(engine.locked, true);
  assert.equal(engine.running, true);
  assert.equal(engine.paused, false);
  assert.equal(engine.elapsed(), 12);
  clock.advance(2000);
  assert.equal(engine.elapsed(), 14);
});

test('restore() com currentItemId ausente da playlist não reativa reprodução', () => {
  const engine = new PlaybackEngine();
  const playlist = [makeItem('a')];
  engine.restore({ currentItemId: 'ghost', elapsed: 5, isPlaying: true, locked: false, blackout: false, presenting: true }, playlist);
  assert.equal(engine.currentId, null);
  assert.equal(engine.running, false);
});

test('restore() com estado null reseta para o estado inicial', () => {
  const engine = new PlaybackEngine();
  engine.start([makeItem('a')]);
  engine.restore(null, []);
  assert.equal(engine.currentId, null);
  assert.equal(engine.running, false);
  assert.equal(engine.elapsed(), 0);
});
