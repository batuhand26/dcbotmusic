const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueueDescription } = require('../src/queue-display');

function makeQueue(currentTrack, upcoming = []) {
  return {
    currentTrack,
    tracks: { toArray: () => upcoming, size: upcoming.length },
  };
}

test('renders the usual queue without changing its layout', () => {
  const description = buildQueueDescription(makeQueue(
    { title: 'Playing song', duration: '3:22' },
    [{ cleanTitle: 'Upcoming song', duration: '4:10' }],
  ));
  assert.equal(description, '**Now playing:** Playing song\n\n1. Upcoming song — 4:10');
});

test('handles an empty queue and missing metadata', () => {
  assert.equal(
    buildQueueDescription(makeQueue(null)),
    '\n_There are no more tracks in the queue._',
  );
  assert.equal(
    buildQueueDescription(makeQueue(null, [{}])),
    '\n1. Unknown track — ?',
  );
});

test('keeps extremely long track metadata within the Discord embed limit', () => {
  const veryLong = 'L'.repeat(10000);
  const tracks = Array.from({ length: 50 }, () => ({ title: veryLong, duration: veryLong }));
  const description = buildQueueDescription(makeQueue({ title: veryLong }, tracks));
  assert.ok(description.length <= 4096, `description was ${description.length} characters`);
  assert.match(description, /…and 40 more track\(s\)\.$/);
  assert.ok(!description.includes('11. '));
});

test('normalizes multiline metadata without adding fake queue entries', () => {
  const description = buildQueueDescription(makeQueue(null, [{ title: 'Song\n2. fake', duration: '3:\n20' }]));
  assert.equal(description, '\n1. Song 2. fake — 3: 20');
});
