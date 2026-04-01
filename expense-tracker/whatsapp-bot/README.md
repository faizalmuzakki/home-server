# WhatsApp Expense Tracker Bot

`expense-tracker/whatsapp-bot` is a Baileys-based WhatsApp bot that started as an expense tracker and now also carries a portable subset of the shared `palu-gada-bot` and `palu-gada-root-bot` utility/productivity features.

## Features

### Finance

- Freeform private-chat expense parsing, income parsing, and receipt image parsing
- `/categories` to list expense and income categories from the API
- `/pin` to show the dashboard PIN

### AI

- `/ask <question>`
- `/tldr <text> [bullets|sentence|paragraph|takeaways]`
- `/explain <topic> [eli5|beginner|intermediate|advanced|expert]`
- `/translate <to-language> | <text> [| <from-language|auto>]`
- `/recap [hours]` using locally stored message history
- Group mention Q&A in allowlisted groups

### Utility

- `/weather <location> [metric|imperial|standard]`
- `/qrcode <text>` sends a QR image
- `/shorten <url>`
- `/emoji <emoji>`

### Productivity

- `/afk [message]` — group-only; auto-clears when the user speaks again in any group
- `/countdown <datetime>`
- `/todo add|list|done|undone|remove|clear ...`
- `/note add|list|view|edit|delete ...`

### Social and Fun

- `/birthday set|view|remove|upcoming|today|setup ...`
- `/poll <question> | [options] [--duration 10m]`
- `/vote <poll_id> <option_number>`
- `/pollresult <poll_id>`
- `/giveaway start|join|end|reroll|list ...`
- `/confession send|setup|toggle|status ...`
- `/trivia [category] [difficulty]`
- `/answer <trivia_id> <A-D>`

### Automation

- `/autoresponder add|remove|list ...`
- `/welcomer setup|enable|disable|test|status ...`
- Background birthday announcements for groups that enabled them

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in:

- `ALLOWED_NUMBERS` — required; comma-separated phone numbers allowed to use the bot in private chat
- `API_URL` — expense tracker API base URL
- `DASHBOARD_PIN` — PIN shown by `/pin`
- `ANTHROPIC_API_KEY` — for AI commands and expense parsing
- `ALLOWED_GROUPS` — comma-separated group JIDs that can use the group mention Q&A feature

Optional:

- `ANTHROPIC_MODEL` — override the Claude model (default: `claude-sonnet-4-6`)

3. Start the bot:

```bash
npm start
```

4. Scan the QR code shown in the terminal or open `auth_info/qr-code.png`.

## Data Storage

Stateful WhatsApp parity features are stored locally in `data/bot.db` via `better-sqlite3`.

Stored data includes:

- todos
- notes
- AFK status
- birthdays
- polls
- giveaways
- trivia rounds
- autoresponders
- confessions
- lightweight message history for `/recap`

## WhatsApp Adaptations

These ports are intentionally adapted instead of forced 1:1:

- Polls use `/vote` instead of reactions
- Giveaways use `/giveaway join` instead of reactions
- Confessions relay into a configured target group JID
- Welcomer uses WhatsApp group participant events
- Recap uses locally stored incoming text history rather than a platform channel-history API

## Explicitly Excluded or Not Yet Ported

These features from the other bots do not currently map well or were intentionally deferred:

- Voice/music playback
- Reaction roles
- Thread automation
- Starboard
- Rich server/member/avatar metadata surfaces tied to Discord/Root APIs
- GitHub webhook-driven features
- Full moderation parity and audit-log parity

## Security

- `ALLOWED_NUMBERS` is required; the bot will not start without it. It restricts who can use the bot in **private chat** (expense tracking, `/pin`, `/categories`, etc.). Group commands are open to all participants in groups the bot is a member of.
- Group Q&A (bot mention) only responds in groups listed in `ALLOWED_GROUPS`
- Group admin checks are used for sensitive group commands: welcomer setup/enable/disable, autoresponder add/remove, confession setup/toggle, giveaway start/end, and birthday announcements setup
- The welcomer is **opt-in** per group — run `/welcomer setup` to enable it
