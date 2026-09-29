const test = require('node:test');
const assert = require('node:assert/strict');
const { NowPlayingPanelStore } = require('../src/now-playing-panels');

function makeStore(options = {}) {
  let sequence = 0;
  return new NowPlayingPanelStore({
    createId: () => `panel-${++sequence}`,
    ...options,
  });
}

test('panel store keeps only lightweight ids', () => {
  const store = makeStore();
  const id = store.register('guild-1', 'track-1');
  assert.deepEqual(store.get(id), {
    guildId: 'guild-1',
    trackId: 'track-1',
    expiresAt: store.get(id).expiresAt,
  });
});

test('panel store evicts oldest entries at the configured cap', () => {
  const store = makeStore({ maxEntries: 2 });
  const first = store.register('guild-1', 'track-1');
  const second = store.register('guild-1', 'track-2');
  const third = store.register('guild-1', 'track-3');

  assert.equal(store.get(first), null);
  assert.ok(store.get(second));
  assert.ok(store.get(third));
  assert.equal(store.size, 2);
});

test('panel store expires stale entries lazily', () => {
  let now = 1000;
  const store = makeStore({ ttlMs: 50, now: () => now });
  const id = store.register('guild-1', 'track-1');
  assert.ok(store.get(id));
  now = 1050;
  assert.equal(store.get(id), null);
  assert.equal(store.size, 0);
});

test('panel store can clear a guild or one finished track', () => {
  const store = makeStore();
  const first = store.register('guild-1', 'track-1');
  const second = store.register('guild-1', 'track-2');
  const third = store.register('guild-2', 'track-1');

  store.deleteForTrack('guild-1', 'track-1');
  assert.equal(store.get(first), null);
  assert.ok(store.get(second));
  assert.ok(store.get(third));

  store.deleteForGuild('guild-1');
  assert.equal(store.get(second), null);
  assert.ok(store.get(third));
});
