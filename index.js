require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { Player, QueryType, QueueRepeatMode, Track, Playlist, SearchResult } = require('discord-player');
const { FFmpeg } = require('@discord-player/ffmpeg');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeExtractor, getInnertube } = require('discord-player-youtubei');
const {
  normalizePlayQuery,
  getYoutubeMixInfo,
  getPlaySearchEngine,
} = require('./src/play-query');
const { NowPlayingPanelStore } = require('./src/now-playing-panels');
const { replyError } = require('./src/interaction');

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = new Player(client);
const nowPlayingPanels = new NowPlayingPanelStore();
const MAX_MIX_TRACKS = 50;

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
    .setName('loop')
    .setDescription('Change the music loop mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Choose what should repeat')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Current track', value: 'track' },
          { name: 'Queue', value: 'queue' },
        ),
    ),
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

function registerNowPlayingPanel(queue, track) {
  return nowPlayingPanels.register(queue.guild.id, track.id);
}

function createNowPlayingComponents(queue, panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`np:${panelId}:toggle`)
        .setLabel(queue.node.isPaused() ? 'Resume' : 'Pause')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`np:${panelId}:skip`)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`np:${panelId}:stop`)
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function createNowPlayingPayload(queue, track) {
  const panelId = registerNowPlayingPanel(queue, track);
  const embed = new EmbedBuilder()
    .setTitle('🎵 Now playing')
    .setDescription(`[${track.cleanTitle || track.title}](${track.url})`)
    .addFields(
      { name: 'Duration', value: track.duration || 'Unknown', inline: true },
      { name: 'Requested by', value: track.requestedBy ? `<@${track.requestedBy.id}>` : 'Unknown', inline: true },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  return { embeds: [embed], components: createNowPlayingComponents(queue, panelId) };
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

    if (tracks.length >= MAX_MIX_TRACKS) break;
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
    const fallback = await createYoutubeMixSearchResult(query, requestedBy);
    if (fallback?.hasTracks()) return fallback;
  } catch (error) {
    console.warn(`YouTube Mix lookup failed: ${error.message}`);
  }

  return `https://www.youtube.com/watch?v=${mix.videoId}`;
}

async function handleNowPlayingButton(interaction) {
  if (!interaction.guildId) return replyError(interaction, 'Music controls are only available in a server.');

  const [, panelId, action] = interaction.customId.split(':');
  const panel = nowPlayingPanels.get(panelId);
  if (!panel) {
    return replyError(interaction, 'This control panel has expired. Run /nowplaying for current controls.');
  }

  const queue = getQueue(interaction);
  if (!queue || interaction.guildId !== panel.guildId || queue.currentTrack?.id !== panel.trackId) {
    nowPlayingPanels.delete(panelId);
    return replyError(interaction, 'This panel is out of date. Run /nowplaying for the current track controls.');
  }
  if (!sameVoiceChannel(interaction, queue)) {
    return replyError(interaction, 'You must be in the same voice channel as the bot to use these controls.');
  }

  if (action === 'toggle') {
    const wasPaused = queue.node.isPaused();
    const changed = wasPaused ? queue.node.resume() : queue.node.pause();
    if (!changed) return replyError(interaction, 'Playback could not be updated.');

    await interaction.update({
      components: createNowPlayingComponents(queue, panelId),
    });
    return interaction.followUp({
      content: wasPaused ? '▶️ Playback resumed.' : '⏸️ Playback paused.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'skip') {
    const trackName = queue.currentTrack.cleanTitle || queue.currentTrack.title;
    if (!queue.node.skip()) return replyError(interaction, 'There is no track to skip.');
    nowPlayingPanels.delete(panelId);
    await interaction.update({ components: [] });
    return interaction.followUp({
      content: `⏭️ Skipped **${trackName}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'stop') {
    queue.clear();
    nowPlayingPanels.deleteForGuild(interaction.guildId);
    queue.delete();
    await interaction.update({ components: [] });
    return interaction.followUp({
      content: '⏹️ Playback stopped and the queue was cleared.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return replyError(interaction, 'This control is not supported.');
}

async function sendNowPlaying(queue, track) {
  const channelId = queue.metadata?.channelId;
  if (!channelId) return;

  try {
    nowPlayingPanels.deleteForGuild(queue.guild.id);
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    await channel.send(createNowPlayingPayload(queue, track));
  } catch (error) {
    console.error('Failed to send the now playing message:', error.message);
  }
}

player.events.on('playerStart', sendNowPlaying);

player.events.on('playerFinish', (queue, track) => {
  nowPlayingPanels.deleteForTrack(queue.guild.id, track.id);
});

player.events.on('queueDelete', (queue) => {
  nowPlayingPanels.deleteForGuild(queue.guild.id);
});

player.events.on('error', (queue, error) => {
  console.error(`[Player error] guild=${queue?.guild?.id ?? 'unknown'}`, error);
});

player.events.on('playerError', (queue, error) => {
  console.error(`[Track error] guild=${queue?.guild?.id ?? 'unknown'}`, error);
});

async function handleClientReady() {
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
}

client.once('clientReady', () => {
  handleClientReady().catch((error) => {
    console.error('Client-ready initialization failed:', error);
  });
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('np:')) {
    try {
      return await handleNowPlayingButton(interaction);
    } catch (error) {
      console.error('Now Playing button action failed:', error);
      try {
        return await replyError(interaction, 'Something went wrong while running this control. Check the console output.');
      } catch (replyFailure) {
        console.error('Failed to send the button error response:', replyFailure);
        return null;
      }
    }
  }

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
        searchEngine: getPlaySearchEngine(typeof playInput === 'string' ? playInput : query),
        nodeOptions: {
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
      if (!queue.node.pause()) return replyError(interaction, 'Playback could not be paused.');
      return interaction.reply('⏸️ Playback paused.');
    }

    if (interaction.commandName === 'resume') {
      if (!queue.node.isPaused()) return replyError(interaction, 'Playback is already running.');
      if (!queue.node.resume()) return replyError(interaction, 'Playback could not be resumed.');
      return interaction.reply('▶️ Playback resumed.');
    }

    if (interaction.commandName === 'skip') {
      const current = queue.currentTrack;
      if (!current) return replyError(interaction, 'There is no track to skip.');
      if (!queue.node.skip()) return replyError(interaction, 'There is no track to skip.');
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

    if (interaction.commandName === 'loop') {
      const mode = interaction.options.getString('mode', true);
      const repeatModes = {
        off: QueueRepeatMode.OFF,
        track: QueueRepeatMode.TRACK,
        queue: QueueRepeatMode.QUEUE,
      };

      queue.setRepeatMode(repeatModes[mode]);

      if (mode === 'track') return interaction.reply('🔂 Loop enabled for the current track.');
      if (mode === 'queue') return interaction.reply('🔁 Loop enabled for the whole queue.');
      return interaction.reply('➡️ Loop disabled.');
    }

    if (interaction.commandName === 'nowplaying') {
      const track = queue.currentTrack;
      if (!track) return replyError(interaction, 'There is no track playing right now.');
      return interaction.reply(createNowPlayingPayload(queue, track));
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

async function start() {
  if (!token) {
    throw new Error('DISCORD_TOKEN is missing. Create a .env file and add your bot token.');
  }

  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YoutubeExtractor, {});
  await client.login(token);
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start the bot:', error);
    client.destroy();
    process.exitCode = 1;
  });
}

