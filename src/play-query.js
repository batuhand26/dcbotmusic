const { QueryType } = require('discord-player');

function normalizePlayQuery(input) {
  const query = input
    .trim()
    .replace(/\\([\\_*[\]()~`>#+\-=|{}.!&])/g, '$1');

  const httpsIndex = query.toLowerCase().indexOf('https://');
  const httpIndex = query.toLowerCase().indexOf('http://');
  const starts = [httpsIndex, httpIndex].filter((index) => index >= 0);
  if (starts.length === 0) return query;

  const start = Math.min(...starts);
  let rawUrl = query.slice(start);
  const delimiterIndex = rawUrl.search(/[\s<>[\]()]/);
  if (delimiterIndex >= 0) rawUrl = rawUrl.slice(0, delimiterIndex);
  rawUrl = rawUrl.replace(/[.,;:!?]+$/, '');

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isYoutubeHost = host === 'youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com';

    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      if (!videoId) return rawUrl;
      const canonical = new URL('https://www.youtube.com/watch');
      canonical.searchParams.set('v', videoId);
      const playlistId = url.searchParams.get('list');
      if (playlistId) canonical.searchParams.set('list', playlistId);
      return canonical.toString();
    }

    if (isYoutubeHost) {
      let videoId = url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (!videoId && ['shorts', 'live', 'embed'].includes(parts[0])) videoId = parts[1];
      const playlistId = url.searchParams.get('list');

      if (videoId) {
        const canonical = new URL('https://www.youtube.com/watch');
        canonical.searchParams.set('v', videoId);
        if (playlistId) canonical.searchParams.set('list', playlistId);
        return canonical.toString();
      }

      if (playlistId) return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    }
  } catch {
    // Keep the extracted URL; discord-player will report it if it is invalid.
  }

  return rawUrl;
}

function getYoutubeUrlInfo(query) {
  try {
    const url = new URL(query);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isYoutubeHost = host === 'youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
    if (!isYoutubeHost) return null;

    const videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v');

    return { videoId: videoId || null, playlistId: url.searchParams.get('list') };
  } catch {
    return null;
  }
}

function getYoutubeMixInfo(query) {
  const info = getYoutubeUrlInfo(query);
  if (!info?.videoId || !info.playlistId?.startsWith('RD')) return null;
  return info;
}

function getPlaySearchEngine(query) {
  const youtube = getYoutubeUrlInfo(query);
  if (youtube?.playlistId) return QueryType.YOUTUBE_PLAYLIST;

  try {
    new URL(query);
    return QueryType.AUTO;
  } catch {
    return QueryType.YOUTUBE_SEARCH;
  }
}

module.exports = {
  normalizePlayQuery,
  getYoutubeUrlInfo,
  getYoutubeMixInfo,
  getPlaySearchEngine,
};
