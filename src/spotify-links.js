const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist']);
const SPOTIFY_URI = /^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/i;

// Spotify links provide metadata, not audio streams. discord-player bridges
// playback to an available stream extractor such as YouTube or SoundCloud.
function spotifyLinkInfo(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  const uri = SPOTIFY_URI.exec(value);
  if (uri) {
    const type = uri[1].toLowerCase();
    const id = uri[2];
    return { type, id, url: `https://open.spotify.com/${type}/${id}` };
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'open.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const offset = /^intl-[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0] || '') ? 1 : 0;
    if (parts.length !== offset + 2) return null;
    const [type, id] = parts.slice(offset);
    if (!SPOTIFY_KINDS.has(type) || !SPOTIFY_ID.test(id)) return null;
    return { type, id, url: `https://open.spotify.com/${type}/${id}` };
  } catch {
    return null;
  }
}

module.exports = { spotifyLinkInfo };
