# Discord Music Bot

A lightweight Discord music bot built with Node.js, [discord.js](https://discord.js.org/), and [discord-player](https://discord-player.js.org/). It provides slash commands for playing music, managing the queue, controlling playback, and adjusting volume.

## Features

- Play songs or playlists from a search query or URL
- Pause and resume playback
- Skip the current track
- Stop playback and clear the queue
- View the current queue
- Show the currently playing track
- Control playback from Now Playing buttons
- Loop the current track or the whole queue
- Adjust playback volume
- Configure Discord voice bitrate with `/quality`; avoid unnecessary transcoding when supported
- Leave the voice channel
- Optional guild-specific slash command registration for faster development

## Commands

| Command | Description |
| --- | --- |
| `/play <query>` | Play a song or playlist from a name or URL |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/skip` | Skip the current track |
| `/stop` | Stop playback and clear the queue |
| `/queue` | Show the current music queue |
| `/remove <position>` | Remove an upcoming track |
| `/move <from> <to>` | Reorder upcoming tracks |
| `/shuffle` | Shuffle upcoming tracks |
| `/skipto <position>` | Skip to an upcoming track, dropping earlier tracks |
| `/clear` | Clear upcoming tracks while the current song continues |
| `/nowplaying` | Show the currently playing track |
| `/loop <off|track|queue>` | Disable looping, repeat the current track, or repeat the whole queue |
| `/volume <0-100>` | Change the playback volume |
| `/quality <auto|64|96|128>` | Set the Discord voice encoding bitrate (kbps) |
| `/leave` | Disconnect the bot from the voice channel |

Upcoming track positions start at **1** in `/queue`; the currently playing song is not numbered. Queue editing requires being in the same voice channel as the bot.

## Audio quality and stability

The bot uses Discord Player's optional `skipFFmpeg` path for demuxable audio streams and still uses FFmpeg when conversion is necessary. Unused DSP filters remain disabled. Audio buffering and connection timeouts are set to 20 seconds to tolerate short connection delays. The initial channel metadata is provided before playback starts so a fast first track can still announce itself.

Use `/quality auto` for the default adaptive bitrate (recommended). You can also select `/quality 64`, `/quality 96` or `/quality 128` to request fixed voice encoder bitrates (in kbps). These choices **do not upgrade source audio** and may be constrained by the voice channel/server settings. Settings last for the active queue and reset after the queue is deleted or the bot restarts.

If the source audio is distorted, a higher encoding bitrate alone cannot restore missing detail. Avoid unnecessary audio processing and check the original source and network/hosting performance.

## Now Playing Controls

Automatic Now Playing announcements and `/nowplaying` include **Pause/Resume**, **Skip**, and **Stop** buttons. The pause button toggles based on the current playback state. Controls only work for the queue and track shown in that panel, and the user must be in the bot's voice channel. Older panels cannot control a later track, and panels expire after a bot restart; use `/nowplaying` for fresh controls.

## Requirements

- Node.js
- npm
- A Discord application with a bot user
- FFmpeg available to the bot

## Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot user.

3. Invite the bot to your server with the `bot` and `applications.commands` scopes. Make sure it can `View Channel`, `Connect`, and `Speak` in the voice channels where it will be used.

4. Copy `.env.example` to `.env` and add your bot token:

   ```env
   DISCORD_TOKEN=your_discord_bot_token
   GUILD_ID=
   ```

   `GUILD_ID` is optional. During development, setting it to a server ID registers slash commands only in that server, so command updates appear faster. Leave it empty to register commands globally.

5. Start the bot:

   ```bash
   npm start
   ```

## Development

Check the main file for JavaScript syntax errors:

```bash
npm run check
```

Run the local unit tests for URL parsing, interaction responses, and Now Playing panel lifecycle:

```bash
npm test
```

If playback stops working after upstream YouTube changes, updating the extractor-related dependencies may help:

```bash
npm update
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token from the Developer Portal |
| `GUILD_ID` | No | Server ID used for fast guild-specific command registration during development |

Never commit your `.env` file or bot token. The repository already ignores `.env` and log files.

## License

MIT
