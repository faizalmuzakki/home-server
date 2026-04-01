# Palu Gada Root Bot

A server-side bot for the Root platform, built with `@rootsdk/server-bot`.

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Docker](https://www.docker.com/) (optional, for containerized deployment)
- A Root Developer Account and `DEV_TOKEN` from the [Root Developer Portal](https://dev.rootapp.com).

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd palu-gada-root-bot
    ```

2.  **Configure Environment:**
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and fill in your credentials:
    - `DEV_TOKEN`: Your bot's development token.
    - `ANTHROPIC_API_KEY`: API key for AI features (optional).

3.  **Install Dependencies:**
    ```bash
    npm install
    ```

## Development

To run the bot locally in development mode:

```bash
npm run bot
```

This starts the bot using `rootsdk start devhost`.

## Docker Deployment

To run the bot in a Docker container (production-ready):

1. **Run Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

The bot uses a named volume `bot-data` for persistent storage of the SQLite database. The `Dockerfile` is configured to grant the non-root `botuser` ownership of the application directory, ensuring the `@rootsdk` framework can create its internal database (`rootsdk.sqlite3`) and files without permission issues.

## Project Structure

- `src/`: Source code.
    - `commands/`: Bot command handlers organized by category.
    - `database/`: Database connection and schema (SQLite with lazy initialization).
    - `features/`: Distinct features like Starboard and Auto-Role.
    - `main.ts`: Entry point.
    - `config.ts`: Configuration loader.
- `data/`: SQLite database storage (mounted via Docker volume in production).

## Usage

The bot supports the following commands:

### Utility
- `/ping`: Check bot latency and API status.
- `/help`: List available commands or inspect one command.
- `/summarize`: Summarize recent chat history (requires AI key).
- `/ask`: Ask AI a question (requires AI key).
- `/answer`: Generate a reply suggestion based on recent conversation style (requires AI key).
- `/tldr`: Summarize pasted text or a URL hint in different styles (requires AI key).
- `/explain`: Explain a topic at different knowledge levels (requires AI key).
- `/translate`: Translate text between languages (requires AI key).
- `/recap`: Generate a recap of recent channel activity (requires AI key).
- `/weather`: Get weather information for a location.
- `/qrcode`: Generate a QR code link for text or URLs.
- `/shorten`: Shorten a URL.
- `/emoji`: Inspect Unicode emoji metadata.
- `/userinfo`, `/serverinfo`, `/avatar`: Adapted platform-aware info commands for Root communities.
- `/math`: Evaluate mathematical expressions.
- `/define`: Get the definition of a word.
- `/urban`: Search Urban Dictionary.
- `/anime`, `/manga`, `/drama`: Search anime, manga, and drama info.

### Productivity
- `/todo`: Manage your personal todo list (`add`, `list`, `done`, `undone`, `remove`, `clear`).
- `/remind`: Set a reminder.
- `/note`: Save and manage personal notes (`add`, `list`, `view`, `edit`, `delete`).
- `/afk`: Set an AFK status and auto-clear it when you talk again.
- `/countdown`: Calculate the time until a target date/time.

### Economy & Levels
- `/balance`: Check your wallet balance.
- `/daily`: Claim your daily currency reward.
- `/level`: Check your current level and XP.
- `/leaderboard`: View economy or level rankings.
- `/toproles`: Configure top-rank role rewards.

### Fun
- `/8ball`: Ask the magic 8-ball a question.
- `/roll`: Roll dice (e.g., `/roll 2d6`).
- `/joke`: Get a random joke (with button reveals for punchlines).
- `/meme`: Get a random meme from Reddit.
- `/trivia`: Start an adapted trivia round with a timed answer reveal.
- `/birthday`: Manage birthdays (`set`, `view`, `remove`, `upcoming`, `today`, `setup`).
- `/confession`: Send and manage anonymous confessions (`send`, `setup`, `toggle`, `status`).
- `/giveaway`: Manage giveaways (`start`, `end`, `reroll`, `list`).
- `/starboard`: Configure message highlighting via reactions.
- `/poll`: Create yes/no or multi-option polls, with optional timed results via `--duration`.

### Moderation
- `/warn`: Warn a user.
- `/warnings`: View warnings for a user.
- `/kick`: Kick a user from the community.
- `/ban`: Ban a user from the community.
- `/autorole`: Configure auto-role for new members (`set`, `enable`, `disable`, `status`).
- `/modlog`, `/timeout`, `/untimeout`: View and manage moderation history/timeouts.

### Automation
- `/welcomer`: Configure welcome messages (`setup`, `enable`, `disable`, `test`, `status`).
- `/autoresponder`: Configure keyword-based automatic replies (`add`, `remove`, `list`).
- `/levelchannel`: Route level-up announcements to a configured channel.
- `/logs`: Configure logging output and recent log viewing (`setup`, `enable`, `disable`, `status`, `view`, `message-edits`, `message-deletes`).
- `/statschannel`: Adapted stats channel support for member-count channel renames.
- `/autothread`: Adapted auto-thread behavior using reply prompts instead of Discord-native threads.
- `/reactionrole`: Configure reaction roles for supported emoji-role mappings.

## Parity Notes

- `welcomer`, `autoresponder`, and `levelchannel` are close ports of the Discord bot behavior.
- `logs` supports moderation actions plus message edit/delete events that are observable in Root.
- `statschannel` is currently adapted to `members` count updates.
- `autothread` is adapted to post a reply prompt because Root does not expose Discord-style thread creation.
- `userinfo`, `serverinfo`, and `avatar` are adapted to Root community/member metadata rather than Discord profile embeds.
- `reactionrole` is supported because Root exposes reaction add/remove events and role assignment APIs.
- `github` and `github-bulk` are not yet ported because reliable webhook ingress/public callback handling is not present in this bot runtime.
- Music and voice playback parity is currently blocked: the Root SDK exposes RTC moderation operations, but not a playback/media control surface comparable to the Discord voice stack.

## How to Invite to Other Communities

To add this bot to another community on the Root platform:

1.  **Get your App ID**: Open your `root-manifest.json` or find it in the [Root Developer Portal](https://dev.rootapp.com).
2.  **Generate Invite Link**: Use the standard Root app installation URL format:
    `https://rootapp.com/app/install?id=YOUR_APP_ID` (replace `YOUR_APP_ID` with your actual ID).
3.  **Authorize**: Open the link in your browser, select the community you'd like to add the bot to, and authorize the installation.
    - *Note: You must have "Manage Apps" permissions in the target community.*
4.  **Start the Bot**: Once installed, ensure your bot process is running (via Docker or `npm run bot`). It will automatically detect and attach to the new community.
