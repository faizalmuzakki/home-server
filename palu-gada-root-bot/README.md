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

1. **Prepare Data Directory**:
   Since the bot runs as a non-root user (`botuser`), you need to create the `data` directory on the host and ensure it is writable:
   ```bash
   mkdir -p data
   chmod 777 data
   ```
   *(Note: This is necessary because Docker bind mounts can sometimes cause permission issues with non-root users)*

2. **Run Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

This will:
- Build the Docker image.
- Start the container in detached mode.
- Mount the `data` directory for persistent storage (SQLite database).

## Project Structure

- `src/`: Source code.
    - `commands/`: Bot command handlers.
    - `database/`: Database connection and schema (SQLite).
    - `features/`: distinct features like Starboard.
    - `main.ts`: Entry point.
    - `config.ts`: Configuration loader.
- `data/`: SQLite database storage (created at runtime).

## Usage

The bot supports the following commands:

### Utility
- `/ping`: Check bot latency.
- `/summarize`: Summarize the last hour of chat history in the current channel (requires `ANTHROPIC_API_KEY`).

### Productivity
- `/todo`: Manage your personal todo list.
- `/remind`: Set a reminder.

### Economy & Levels
- `/balance`: Check your wallet balance.
- `/daily`: Claim your daily currency reward.
- `/level`: Check your current level and XP.

### Fun
- `/birthday`: Set or view birthdays.
- `/confession`: Send an anonymous confession.
- `/giveaway`: Start a giveaway event.

### Moderation
- `/warn`: Warn a user.
- `/warnings`: View warnings for a user.
- `/kick`: Kick a user from the community.
- `/ban`: Ban a user from the community.

