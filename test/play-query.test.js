const test = require('node:test');
const assert = require('node:assert/strict');
const { QueryType } = require('discord-player');
const {
  normalizePlayQuery,
  getYoutubeUrlInfo,
  getYoutubeMixInfo,
  getPlaySearchEngine,
} = require('../src/play-query');

test('normalizePlayQuery canonicalizes YouTube URL variants', () => {
  assert.equal(
    normalizePlayQuery('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(
    normalizePlayQuery('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(
    normalizePlayQuery('https://www.youtube.com/playlist?list=PL123'),
    'https://www.youtube.com/playlist?list=PL123',
  );
});

test('normalizePlayQuery preserves playlist ids and extracts embedded URLs', () => {
  assert.equal(
    normalizePlayQuery('play https://youtu.be/dQw4w9WgXcQ?list=RD123 please'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123',
  );
  assert.equal(
    normalizePlayQuery('https://example.com/song.'),
    'https://example.com/song',
  );
});

test('getYoutubeUrlInfo classifies supported YouTube URLs', () => {
  assert.deepEqual(
    getYoutubeUrlInfo('https://youtu.be/dQw4w9WgXcQ?list=RD123'),
    { videoId: 'dQw4w9WgXcQ', playlistId: 'RD123' },
  );
  assert.equal(getYoutubeUrlInfo('https://example.com/watch?v=x'), null);
  assert.equal(getYoutubeUrlInfo('not a url'), null);
});

test('getYoutubeMixInfo requires both a video id and RD playlist id', () => {
  assert.deepEqual(
    getYoutubeMixInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123'),
    { videoId: 'dQw4w9WgXcQ', playlistId: 'RD123' },
  );
  assert.equal(getYoutubeMixInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123'), null);
  assert.equal(getYoutubeMixInfo('https://www.youtube.com/playlist?list=RD123'), null);
});

test('getPlaySearchEngine chooses the narrowest useful search engine', () => {
  assert.equal(
    getPlaySearchEngine('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123'),
    QueryType.YOUTUBE_PLAYLIST,
  );
  assert.equal(getPlaySearchEngine('https://example.com/audio.mp3'), QueryType.AUTO);
  assert.equal(getPlaySearchEngine('never gonna give you up'), QueryType.YOUTUBE_SEARCH);
});
