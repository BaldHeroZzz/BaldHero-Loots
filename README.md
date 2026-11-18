# DQR DROPS 2.0

Mobile-first Dungeon Quest Discord drop tracker.

## Features
- Combines matching item names by rarity across all recorded messages.
- Adds quantities together and shows item totals grouped by Ultimate, Legendary, Epic, Rare, Uncommon and Common.
- Shows total item drops, unique item types, and recorded runs.
- Search and sort inventory by rarity, quantity or name.
- Shows how many Discord messages contained each item and its latest recorded time.
- Shows recent run activity.
- Discord bot reads new embeds and checks the latest 100 messages on startup.

## GitHub
Create a NEW private repository named `dqr-drops-2`. Upload all files and folders from this project, preserving the structure.

## Discord
Create a bot in the Discord Developer Portal, enable Message Content Intent, and invite it to the server that contains the Sottoro drop channel. Grant View Channel and Read Message History.

## Render
Create a new Web Service from the GitHub repository. Runtime: Node. Build command: `npm install`. Start command: `npm start`.

Add environment variables:
- `DISCORD_TOKEN` = private bot token
- `DISCORD_CHANNEL_ID` = channel ID that posts Sottoro drops
- `DATA_DIR` = `/var/data` after adding a Persistent Disk mounted at `/var/data`

Attach a Render Persistent Disk at `/var/data` so history survives restarts and redeploys. Do not publish your bot token in GitHub or share it in chat.

## Parser limitations
The starter parser supports text-based embeds with item lines like `Item Name, Epic x1, pot 12.3M spell (42%)`. Actual embed formatting may vary; test with a live Sottoro message and adjust if necessary. Image-only embeds are not parsed. Startup backfill checks the latest 100 messages only.

## Telegram loot reporting

The Discord listener can also report drops to a Telegram chat. Create a Telegram bot with BotFather, add it to your destination chat, and set these Render environment variables (keep the token private):

- `TELEGRAM_BOT_TOKEN` = bot token from BotFather
- `TELEGRAM_CHAT_ID` = destination chat ID (the bot must be able to post there)
- `TELEGRAM_REPORT_MINUTES` = optional periodic report interval; defaults to `5`
- `TELEGRAM_NO_DROP_MINUTES` = optional inactivity alert threshold; defaults to `10`

Telegram sends immediate messages for Ultimate, Legendary, and Gildenscale drops; periodic activity reports; a no-drop warning after the configured idle period; and a daily summary at midnight Philippines time. The bot also supports `/stats`, `/drops`, `/history`, `/top`, and `/help` in the configured chat. The reporter uses Node.js 18's built-in `fetch`; no extra npm dependency is required. Optional item photos are sent when an ingested item includes an `imageUrl` or `image` URL; the current Discord parser does not yet assign image URLs automatically.
