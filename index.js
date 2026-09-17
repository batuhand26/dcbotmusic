require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { Player, QueryType, Track, Playlist, SearchResult } = require('discord-player');
const { FFmpeg } = require('@discord-player/ffmpeg');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeExtractor, getInnertube } = require('discord-player-youtubei');

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('DISCORD_TOKEN is missing. Create a .env file and add your bot token.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = new Player(client);

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or URL')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the music queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the currently playing track'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Change the playback volume')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Volume level from 0 to 100')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('leave').setDescription('Disconnect the bot from the voice channel'),
].map((command) => command.toJSON());

function getVoiceChannel(interaction) {
  return interaction.member?.voice?.channel ?? null;
}

function getQueue(interaction) {
  return player.nodes.get(interaction.guildId);
}

function sameVoiceChannel(interaction, queue) {
  const memberChannel = getVoiceChannel(interaction);
  const botChannelId = queue?.channel?.id;
  return memberChannel && (!botChannelId || memberChannel.id === botChannelId);
}

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

async function createYoutubeMixSearchResult(query, requestedBy) {
  const mix = getYoutubeMixInfo(query);
  if (!mix) return null;

  const extractor = player.extractors.get(YoutubeExtractor.identifier);
  if (!extractor) throw new Error('YouTube extractor is not loaded.');

  const tube = await getInnertube({});
  const panel = await tube.music.getUpNext(mix.videoId);
  const items = Array.from(panel?.contents || []);
  const tracks = [];
  const seen = new Set();

  for (const item of items) {
    const node = item?.primary || item;
    const videoId = node?.video_id;
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    const track = new Track(player, {
      title: node.title?.toString?.() || 'Unknown title',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      duration: node.duration?.text || '0:00',
      thumbnail: node.thumbnail?.at?.(0)?.url || '',
      author: typeof node.author === 'string' ? node.author : (node.author?.name || 'YouTube'),
      requestedBy,
      source: 'youtube',
      queryType: QueryType.YOUTUBE_VIDEO,
    });
    track.extractor = extractor;
    tracks.push(track);
  }

  if (tracks.length === 0) return null;

  const playlist = new Playlist(player, {
    title: `YouTube Mix - ${tracks[0].cleanTitle || tracks[0].title}`,
    description: 'YouTube Mix',
    thumbnail: tracks[0].thumbnail,
    type: 'playlist',
    source: 'youtube',
    author: { name: 'YouTube Mix', url: '' },
    tracks,
    id: panel.playlist_id || mix.playlistId,
    url: query,
  });

  for (const track of tracks) track.playlist = playlist;

  return new SearchResult(player, {
    query,
    queryType: QueryType.YOUTUBE_PLAYLIST,
    playlist,
    tracks,
    extractor,
    requestedBy,
  });
}

async function resolvePlayInput(query, requestedBy) {
  const mix = getYoutubeMixInfo(query);
  if (!mix) return query;

  try {
    const nativeResult = await player.search(query, {
      requestedBy,
      searchEngine: QueryType.YOUTUBE_PLAYLIST,
      ignoreCache: true,
    });
    if (nativeResult.hasTracks()) return nativeResult;
  } catch (error) {
    console.warn(`Native YouTube Mix lookup failed: ${error.message}`);
  }

  try {
    const fallback = await createYoutubeMixSearchResult(query, requestedBy);
    if (fallback?.hasTracks()) return fallback;
  } catch (error) {
    console.warn(`YouTube Mix fallback failed: ${error.message}`);
  }

  return `https://www.youtube.com/watch?v=${mix.videoId}`;
}

async function replyError(interaction, message) {
  const payload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral };

  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (error) {
    // Discord interactions only live for a short time. If an old interaction is
    // delivered after the bot reconnects, do not let the failed error reply
    // crash the entire process.
    if (error?.code === 10062 || error?.code === 40060) {
      console.warn(`Ignored expired or already-handled interaction: ${error.code}`);
      return null;
    }
    throw error;
  }
}

async function sendNowPlaying(queue, track) {
  const channelId = queue.metadata?.channelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle('🎵 Now playing')
      .setDescription(`[${track.cleanTitle || track.title}](${track.url})`)
      .addFields(
        { name: 'Duration', value: track.duration || 'Unknown', inline: true },
        { name: 'Requested by', value: track.requestedBy ? `<@${track.requestedBy.id}>` : 'Unknown', inline: true },
      );

    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send the now playing message:', error.message);
  }
}

player.events.on('playerStart', sendNowPlaying);

player.events.on('error', (queue, error) => {
  console.error(`[Player error] guild=${queue.guild.id}`, error);
});

player.events.on('playerError', (queue, error) => {
  console.error(`[Track error] guild=${queue.guild.id}`, error);
});

client.once('clientReady', async () => {
  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YoutubeExtractor, {});

  const ffmpeg = FFmpeg.resolveSafe(true);
  if (ffmpeg) {
    console.log(`FFmpeg ready: ${ffmpeg.command} (${ffmpeg.version})`);
  } else {
    console.error('FFmpeg was not found. Audio conversion may fail while using /play.');
  }

  if (guildId) {
    const guild = await client.guilds.fetch(guildId);
    await guild.commands.set(commands);
    console.log(`Slash commands registered in ${guild.name}.`);
  } else {
    await client.application.commands.set(commands);
    console.log('Slash commands registered globally.');
  }

  console.log(`Logged in as ${client.user.tag}.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  try {
    if (interaction.commandName === 'play') {
      const voiceChannel = getVoiceChannel(interaction);
      if (!voiceChannel) return replyError(interaction, 'Join a voice channel first.');

      const existingQueue = getQueue(interaction);
      if (existingQueue && !sameVoiceChannel(interaction, existingQueue)) {
        return replyError(interaction, 'You must be in the same voice channel as the bot.');
      }

      const query = normalizePlayQuery(interaction.options.getString('query', true));
      await interaction.deferReply();

      const playInput = await resolvePlayInput(query, interaction.user);

      const { track, queue, searchResult } = await player.play(voiceChannel, playInput, {
        requestedBy: interaction.user,
        searchEngine: getPlaySearchEngine(query),
        nodeOptions: {
          metadata: { channelId: interaction.channelId },
          volume: 70,
          // Keep the playback pipeline light for local Windows playback.
          // These DSP stages are unused by this bot and can add unnecessary
          // real-time CPU work, which may show up as brief crackling/jitter.
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
        },
      });

      queue.setMetadata({ channelId: interaction.channelId });
      if (searchResult.playlist) {
        return interaction.followUp(`✅ Added playlist **${searchResult.playlist.title}** (${searchResult.tracks.length} tracks) to the queue.`);
      }
      return interaction.followUp(`✅ Added **${track.cleanTitle || track.title}** to the queue.`);
    }

    const queue = getQueue(interaction);
    if (!queue) return replyError(interaction, 'There is no active music queue right now.');
    if (!sameVoiceChannel(interaction, queue)) {
      return replyError(interaction, 'You must be in the same voice channel as the bot to use this command.');
    }

    if (interaction.commandName === 'pause') {
      if (queue.node.isPaused()) return replyError(interaction, 'Playback is already paused.');
      queue.node.pause();
      return interaction.reply('⏸️ Playback paused.');
    }

    if (interaction.commandName === 'resume') {
      if (!queue.node.isPaused()) return replyError(interaction, 'Playback is already running.');
      queue.node.resume();
      return interaction.reply('▶️ Playback resumed.');
    }

    if (interaction.commandName === 'skip') {
      const current = queue.currentTrack;
      if (!current) return replyError(interaction, 'There is no track to skip.');
      queue.node.skip();
      return interaction.reply(`⏭️ Skipped **${current.cleanTitle || current.title}**.`);
    }

    if (interaction.commandName === 'stop') {
      queue.clear();
      queue.delete();
      return interaction.reply('⏹️ Playback stopped and the queue was cleared.');
    }

    if (interaction.commandName === 'leave') {
      queue.delete();
      return interaction.reply('👋 Disconnected from the voice channel.');
    }

    if (interaction.commandName === 'volume') {
      const level = interaction.options.getInteger('level', true);
      queue.node.setVolume(level);
      return interaction.reply(`🔊 Volume set to **${level}%**.`);
    }

    if (interaction.commandName === 'nowplaying') {
      const track = queue.currentTrack;
      if (!track) return replyError(interaction, 'There is no track playing right now.');

      const embed = new EmbedBuilder()
        .setTitle('🎵 Now playing')
        .setDescription(`[${track.cleanTitle || track.title}](${track.url})`)
        .addFields({ name: 'Duration', value: track.duration || 'Unknown', inline: true });

      if (track.thumbnail) embed.setThumbnail(track.thumbnail);
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'queue') {
      const current = queue.currentTrack;
      const upcoming = queue.tracks.toArray().slice(0, 10);
      const lines = [];

      if (current) lines.push(`**Now playing:** ${current.cleanTitle || current.title}`);
      if (upcoming.length) {
        lines.push(
          '',
          ...upcoming.map((track, index) => `${index + 1}. ${track.cleanTitle || track.title} — ${track.duration || '?'}`),
        );
      } else {
        lines.push('', '_There are no more tracks in the queue._');
      }

      if (queue.tracks.size > 10) {
        lines.push('', `…and ${queue.tracks.size - 10} more track(s).`);
      }

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('📜 Music queue').setDescription(lines.join('\n'))],
      });
    }
  } catch (error) {
    console.error(`/${interaction.commandName} command failed:`, error);
    try {
      if (interaction.commandName === 'play' && error?.code === 'ERR_NO_RESULT') {
        return await replyError(interaction, 'No track was found. Try a song name or a valid URL.');
      }
      return await replyError(interaction, 'Something went wrong while running the command. Check the console output.');
    } catch (replyFailure) {
      console.error('Failed to send the error response:', replyFailure);
      return null;
    }
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down the bot.`);
  try {
    await player.destroy();
  } catch (error) {
    console.error('Failed to shut down the player:', error);
  }
  client.destroy();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

client.login(token);

