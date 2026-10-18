const test = require('node:test');
const assert = require('node:assert/strict');
const { spotifyLinkInfo } = require('../src/spotify-links');

const id = '4uLU6hMCjMI75M1A2tKUQC';

test('normalizes Spotify track, album and playlist links', () => {
  for (const type of ['track', 'album', 'playlist']) {
    assert.deepEqual(
      spotifyLinkInfo(`https://open.spotify.com/${type}/${id}?si=tracking#fragment`),
      { type, id, url: `https://open.spotify.com/${type}/${id}` },
    );
    assert.equal(
      spotifyLinkInfo(`spotify:${type}:${id}`).url,
      `https://open.spotify.com/${type}/${id}`,
    );
  }
});

test('handles internationalized Spotify URLs', () => {
  assert.equal(
    spotifyLinkInfo(`https://open.spotify.com/intl-tr/track/${id}?si=abc`).url,
    `https://open.spotify.com/track/${id}`,
  );
});

test('does not treat spoofed domains, invalid ids or other media as Spotify music', () => {
  for (const value of [
    `https://open.spotify.com.attacker.test/track/${id}`,
    `https://evil-open.spotify.com/track/${id}`,
    'https://open.spotify.com/track/short',
    `https://open.spotify.com/episode/${id}`,
    `spotify:episode:${id}`,
    `https://open.spotify.com/track/${id}/extra`,
    `ftp://open.spotify.com/track/${id}`,
    '',
    null,
  ]) {
    assert.equal(spotifyLinkInfo(value), null, String(value));
  }
});
