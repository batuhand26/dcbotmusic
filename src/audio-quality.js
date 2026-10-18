// Keep the default audio path lightweight. Discord Player will transcode
// streams that cannot be handled directly even when skipFFmpeg is enabled.
function buildNodeOptions(channelId) {
  return {
    metadata: { channelId },
    volume: 70,
    bufferingTimeout: 20_000,
    connectionTimeout: 20_000,
    disableEqualizer: true,
    disableFilterer: true,
    disableBiquad: true,
    disableCompressor: true,
    disableReverb: true,
    disableSeeker: true,
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 60_000,
    leaveOnEnd: true,
    leaveOnEndCooldown: 30_000,
    leaveOnStop: true,
  };
}

const BITRATES = Object.freeze({
  auto: { value: 'auto', label: 'Automatic' },
  '64': { value: 64_000, label: '64 kbps' },
  '96': { value: 96_000, label: '96 kbps' },
  '128': { value: 128_000, label: '128 kbps' },
});

function qualityOption(input) {
  return Object.hasOwn(BITRATES, input) ? BITRATES[input] : null;
}

module.exports = { buildNodeOptions, qualityOption };
