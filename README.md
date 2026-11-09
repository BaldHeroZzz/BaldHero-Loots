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
