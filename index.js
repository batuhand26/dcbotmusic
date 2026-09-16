require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { Player } = require('discord-player');
const { FFmpeg } = require('@discord-player/ffmpeg');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeExtractor } = require('discord-player-youtubei');

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
    // Remove Markdown escapes: d7F\_X0AUV\_c -> d7F_X0AUV_c
    .replace(/\\([_()[\]])/g, '$1');

  // Markdown links copied from apps such as Discord or ChatGPT may arrive as
  // `[https://...](https://...)`. Pass only the real URL to discord-player and
  // leave normal song searches unchanged.
  const urlMatch = query.match(/https?:\/\/[^\s<>\]\\)]+/i);
  return urlMatch ? urlMatch[0] : query;
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

      const { track, queue } = await player.play(voiceChannel, query, {
        requestedBy: interaction.user,
        nodeOptions: {
          metadata: { channelId: interaction.channelId },
          volume: 70,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 30_000,
          leaveOnStop: true,
        },
      });

      queue.setMetadata({ channelId: interaction.channelId });
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
