const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNodeOptions, qualityOption } = require('../src/audio-quality');

test('initial queue metadata is supplied before player.play starts', () => {
  const options = buildNodeOptions('channel-1');
  assert.deepEqual(options.metadata, { channelId: 'channel-1' });
  assert.equal(options.volume, 70);
  assert.equal(options.bufferingTimeout, 20_000);
  assert.equal(options.connectionTimeout, 20_000);
  assert.equal(options.disableEqualizer, true);
  assert.equal(options.disableFilterer, true);
  assert.equal(options.disableSeeker, true);
});

test('node options are independent for each request', () => {
  const first = buildNodeOptions('first');
  const second = buildNodeOptions('second');
  first.metadata.channelId = 'edited';
  assert.equal(second.metadata.channelId, 'second');
});

test('accepts only supported voice bitrates', () => {
  assert.deepEqual(qualityOption('auto'), { value: 'auto', label: 'Automatic' });
  assert.deepEqual(qualityOption('64'), { value: 64_000, label: '64 kbps' });
  assert.deepEqual(qualityOption('96'), { value: 96_000, label: '96 kbps' });
  assert.deepEqual(qualityOption('128'), { value: 128_000, label: '128 kbps' });
  for (const invalid of ['320', '128000', '0', 'constructor', '__proto__', null, undefined]) {
    assert.equal(qualityOption(invalid), null);
  }
});
