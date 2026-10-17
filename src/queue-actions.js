// All positions shown to users are 1-based and refer to upcoming tracks only.
function getUpcoming(queue, position) {
  if (!Number.isSafeInteger(position) || position < 1) return null;
  return queue.tracks.toArray()[position - 1] || null;
}

function safeTitle(track) {
  const title = String(track?.cleanTitle || track?.title || 'Unknown track')
    .replace(/\s+/g, ' ')
    .trim();
  return title.length > 150 ? `${title.slice(0, 149)}…` : title;
}

function removeUpcoming(queue, position) {
  const track = getUpcoming(queue, position);
  if (!track) return { error: 'Invalid queue position. Check /queue for the upcoming tracks.' };
  const removed = queue.removeTrack(track);
  if (!removed) return { error: 'The selected track could not be removed.' };
  return { message: `🗑️ Removed **${safeTitle(removed)}** from position ${position}.` };
}

function moveUpcoming(queue, from, to) {
  const size = queue.tracks.size;
  const track = getUpcoming(queue, from);
  if (!track || !Number.isSafeInteger(to) || to < 1 || to > size) {
    return { error: 'Invalid queue position. Both positions must refer to upcoming tracks.' };
  }
  if (from === to) return { message: 'That track is already at that position.' };
  queue.moveTrack(track, to - 1);
  return { message: `↕️ Moved **${safeTitle(track)}** from ${from} to ${to}.` };
}

function shuffleUpcoming(queue) {
  if (queue.tracks.size < 2) return { error: 'Add at least two upcoming tracks to shuffle.' };
  // Only the upcoming tracks are shuffled; the current song stays untouched.
  queue.tracks.shuffle();
  return { message: `🔀 Shuffled ${queue.tracks.size} upcoming tracks.` };
}

function skipToUpcoming(queue, position) {
  const track = getUpcoming(queue, position);
  if (!track) return { error: 'Invalid queue position. Check /queue for the upcoming tracks.' };
  if (!queue.node.skipTo(track)) return { error: 'Unable to skip to the selected track.' };
  return { message: `⏭️ Skipping to **${safeTitle(track)}**.` };
}

function clearUpcoming(queue) {
  const count = queue.tracks.size;
  if (!count) return { error: 'There are no upcoming tracks to clear.' };
  queue.clear();
  return { message: `🧹 Removed ${count} upcoming track(s). The current song continues.` };
}

module.exports = {
  getUpcoming,
  removeUpcoming,
  moveUpcoming,
  shuffleUpcoming,
  skipToUpcoming,
  clearUpcoming,
};
