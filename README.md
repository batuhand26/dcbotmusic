# Discord Music Bot

A lightweight Discord music bot built with Node.js, [discord.js](https://discord.js.org/), and [discord-player](https://discord-player.js.org/). It provides slash commands for playing music, managing the queue, controlling playback, and adjusting volume.

## Features

- Play songs or playlists from a search query or URL
- Pause and resume playback
- Skip the current track
- Stop playback and clear the queue
- View the current queue
- Show the currently playing track
- Adjust playback volume
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
| `/nowplaying` | Show the currently playing track |
| `/volume <0-100>` | Change the playback volume |
| `/leave` | Disconnect the bot from the voice channel |

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
