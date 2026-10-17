// Keep /queue safely within Discord's 4096-character embed description limit.
// At most 11 titles (current + 10 upcoming) are shown, each capped at 240
// characters, leaving room for indices, durations, and the remaining count.
const MAX_TITLE_LENGTH = 240;
const MAX_DURATION_LENGTH = 32;

function summarizeText(value, fallback, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function trackTitle(track) {
  return summarizeText(track?.cleanTitle || track?.title, 'Unknown track', MAX_TITLE_LENGTH);
}

function buildQueueDescription(queue) {
  const current = queue.currentTrack;
  const upcoming = queue.tracks.toArray().slice(0, 10);
  const lines = [];

  if (current) lines.push(`**Now playing:** ${trackTitle(current)}`);
  if (upcoming.length) {
    lines.push('', ...upcoming.map((track, index) => {
      const duration = summarizeText(track?.duration, '?', MAX_DURATION_LENGTH);
      return `${index + 1}. ${trackTitle(track)} — ${duration}`;
    }));
  } else {
    lines.push('', '_There are no more tracks in the queue._');
  }

  if (queue.tracks.size > 10) {
    lines.push('', `…and ${queue.tracks.size - 10} more track(s).`);
  }

  return lines.join('\n');
}

module.exports = { buildQueueDescription };
