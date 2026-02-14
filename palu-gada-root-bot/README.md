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
- `/summarize`: Summarize recent chat history (requires AI key).
- `/ask`: Ask AI a question (requires AI key).
- `/math`: Evaluate mathematical expressions.
- `/define`: Get the definition of a word.
- `/urban`: Search Urban Dictionary.

### Productivity
- `/todo`: Manage your personal todo list.
- `/remind`: Set a reminder.
- `/note`: Save and manage personal notes.

### Economy & Levels
- `/balance`: Check your wallet balance.
- `/daily`: Claim your daily currency reward.
- `/level`: Check your current level and XP.

### Fun
- `/8ball`: Ask the magic 8-ball a question.
- `/roll`: Roll dice (e.g., `/roll 2d6`).
- `/joke`: Get a random joke (with button reveals for punchlines).
- `/meme`: Get a random meme from Reddit.
- `/birthday`: Set or view birthdays.
- `/confession`: Send an anonymous confession.
- `/giveaway`: Start a giveaway event.

### Moderation
- `/warn`: Warn a user.
- `/warnings`: View warnings for a user.
- `/kick`: Kick a user from the community.
- `/ban`: Ban a user from the community.
- `/autorole`: Configure auto-role for new members (`set`, `enable`, `disable`, `status`).

## How to Invite to Other Communities

To add this bot to another community on the Root platform:

1.  **Get your App ID**: Open your `root-manifest.json` or find it in the [Root Developer Portal](https://dev.rootapp.com).
2.  **Generate Invite Link**: Use the standard Root app installation URL format:
    `https://rootapp.com/app/install?id=YOUR_APP_ID` (replace `YOUR_APP_ID` with your actual ID).
3.  **Authorize**: Open the link in your browser, select the community you'd like to add the bot to, and authorize the installation.
    - *Note: You must have "Manage Apps" permissions in the target community.*
4.  **Start the Bot**: Once installed, ensure your bot process is running (via Docker or `npm run bot`). It will automatically detect and attach to the new community.
