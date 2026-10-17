const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUpcoming, removeUpcoming, moveUpcoming, shuffleUpcoming, skipToUpcoming, clearUpcoming,
} = require('../src/queue-actions');

function makeQueue(names = ['A', 'B', 'C']) {
  const tracks = names.map((title, index) => ({ id: index + 1, title }));
  const queue = {
    tracks: {
      toArray: () => [...tracks],
      get size() { return tracks.length; },
      shuffle: () => tracks.reverse(),
    },
    removeTrack(track) {
      const position = tracks.indexOf(track);
      return position < 0 ? null : tracks.splice(position, 1)[0];
    },
    moveTrack(track, to) {
      tracks.splice(tracks.indexOf(track), 1);
      tracks.splice(to, 0, track);
    },
    node: {
      skipTo: (track) => tracks.includes(track),
    },
    clear: () => { tracks.length = 0; },
  };
  return queue;
}

test('positions are 1-based and validated', () => {
  const queue = makeQueue();
  assert.equal(getUpcoming(queue, 1).title, 'A');
  for (const position of [0, -1, 4, 1.5, Infinity, NaN]) {
    assert.equal(getUpcoming(queue, position), null);
    assert.ok(removeUpcoming(queue, position).error);
  }
});

test('remove and move affect only upcoming tracks', () => {
  const queue = makeQueue();
  assert.ok(moveUpcoming(queue, 1, 3).message);
  assert.deepEqual(queue.tracks.toArray().map((track) => track.title), ['B', 'C', 'A']);
  assert.ok(moveUpcoming(queue, 2, 4).error);
  assert.ok(moveUpcoming(queue, 3, 3).message);
  assert.ok(removeUpcoming(queue, 2).message);
  assert.deepEqual(queue.tracks.toArray().map((track) => track.title), ['B', 'A']);
});

test('shuffle, skipto, clear handle both success and empty states', () => {
  const queue = makeQueue();
  assert.ok(shuffleUpcoming(queue).message);
  assert.deepEqual(queue.tracks.toArray().map((track) => track.title), ['C', 'B', 'A']);
  assert.ok(skipToUpcoming(queue, 2).message);
  assert.ok(skipToUpcoming(queue, 4).error);
  assert.ok(clearUpcoming(queue).message);
  assert.equal(queue.tracks.size, 0);
  assert.ok(shuffleUpcoming(queue).error);
  assert.ok(clearUpcoming(queue).error);
});

test('track names are bounded to protect Discord replies', () => {
  const queue = makeQueue(['X'.repeat(400)]);
  const result = removeUpcoming(queue, 1);
  assert.ok(result.message.length < 250);
  assert.match(result.message, /…/);
});
