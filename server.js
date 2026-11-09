
const express = require("express");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "drops.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readDrops() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Database read error:", error.message);
    return [];
  }
}

function writeDrops(rows) {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(rows.slice(0, 20000), null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function clean(value) {
  return String(value || "").replace(/\u0000/g, "").replace(/\r/g, "").trim();
}

function stripMarkdown(value) {
  return clean(value)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/~~(.*?)~~/g, "$1");
}

// NIGHTMARE ITEM CATALOG
// Rarity comes from the Discord drop notification.

const ITEM_CATALOG = {
  "Oathsworn Halberd": {
    category: "Warrior Weapon"
  },
  "Oathsworn Hammer": {
    category: "Warrior Weapon"
  },
  "Oathsworn Sword And Shield": {
    category: "Warrior Weapon"
  },
  "Gildenscale Oath And Aegis": {
    category: "Warrior Weapon"
  },
  "Lumenflame’s Judgement": {
    category: "Warrior Weapon",
    fixedRarity: "Ultimate"
  },

  "Oathsworn Warrior Set": {
    category: "Warrior Armor",
    tier: "Basic"
  },
  "Gildenscale Warrior Set": {
    category: "Warrior Armor",
    tier: "Tier 3"
  },

  "Dracani Gilded Staff": {
    category: "Mage Weapon"
  },
  "Oathsworn Spellscythe": {
    category: "Mage Weapon"
  },
  "Oathsworn Staff And Tome": {
    category: "Mage Weapon"
  },
  "Daybreak and Gildensong": {
    category: "Mage Weapon"
  },
  "Lumenflame’s Absolution": {
    category: "Mage Weapon",
    fixedRarity: "Ultimate"
  },

  "Oathsworn Mage Set": {
    category: "Mage Armor",
    tier: "Basic"
  },
  "Gildenscale Mage Set": {
    category: "Mage Armor",
    tier: "Tier 3"
  },

  "Oathsworn Guardian Set": {
    category: "Guardian Armor",
    tier: "Basic"
  },
  "Gildenscale Guardian Set": {
    category: "Guardian Armor",
    tier: "Tier 3"
  }
};

function getCatalogInfo(itemName) {
  const normalize = value =>
    String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

  const target = normalize(itemName);

  for (const [name, info] of Object.entries(ITEM_CATALOG)) {
    if (normalize(name) === target) return info;
  }

  return {
    category: "Uncategorized",
    tier: null
  };
}

function parseMessage(message) {
  const embedTexts = (message.embeds || []).map(embed => {
    const fields = (embed.fields || [])
      .map(field => `${clean(field.name)}\n${clean(field.value)}`)
      .join("\n");

    return [
      clean(embed.title),
      clean(embed.description),
      fields,
      clean(embed.footer?.text)
    ].filter(Boolean).join("\n");
  });

  const raw = [
    clean(message.content),
    ...embedTexts
  ].filter(Boolean).join("\n\n");

  if (!raw || !/dungeon quest|drops|boss|dungeon/i.test(raw)) {
    return [];
  }

  const text = stripMarkdown(raw);

  const dungeon =
    (text.match(/^\s*Dungeon\s*:?\s+([^\n]+)/im) || [])[1] || "";

  const boss =
    (text.match(/^\s*Boss\s*:?\s+([^\n]+)/im) || [])[1] || "";

  const accounts = Number(
    (text.match(/^\s*Accounts?\s*:?\s*(\d+)/im) || [])[1] || 0
  );

  const items = [];

  const itemRegex =
    /^\s*[⚪🔵🟢🟣🟡🔴🟠]?\s*([^,\n]+?)\s*,\s*(Ultimate|Legendary|Epic|Rare|Uncommon|Common)\s*[×x]\s*(\d+)(?:\s*,\s*pot\s*([\d.]+\s*[KMBT]?)\s*(spell|physical)\s*\((\d+)%\))?/gim;

  let match;

  while ((match = itemRegex.exec(text)) !== null) {
    const name = stripMarkdown(match[1])
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();

    if (!name) continue;

    const catalogInfo = getCatalogInfo(name);

    const parsedRarity =
      match[2][0].toUpperCase() +
      match[2].slice(1).toLowerCase();

    items.push({
      name,
      rarity: catalogInfo.fixedRarity || parsedRarity,
      category: catalogInfo.category,
      armorTier: catalogInfo.tier || null,
      quantity: Math.max(1, Number(match[3]) || 1),
      potential: match[4]
        ? `${match[4].replace(/\s+/g, "")} ${match[5].toLowerCase()}`
        : "",
      percent: match[6] ? Number(match[6]) : null
    });
  }

  const id = message.id || `unknown-${Date.now()}`;

  if (!items.length && !dungeon && !boss) return [];

  return [{
    id: `${id}-0`,
    discordMessageId: id,
    author: message.author?.username || "Discord",
    timestamp:
      message.createdAt?.toISOString?.() ||
      new Date().toISOString(),
    title: "Dungeon Quest drops",
    dungeon: dungeon.trim(),
    boss: boss.trim(),
    accounts: accounts || null,
    items,
    rawText: text,
    sourceUrl: message.url || ""
  }];
}

// WEBSITE API

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "DQR Drops 2"
  });
});

app.get("/api/drops", (_req, res) => {
  res.json(readDrops());
});

app.listen(PORT, () => {
  console.log(`DQR Drops 2 listening on ${PORT}`);
});

// DISCORD BOT

if (process.env.DISCORD_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [
      Partials.Channel,
      Partials.Message
    ]
  });

  async function ingest(message) {
    try {
      const parsed = parseMessage(message);

      if (!parsed.length) return;

      const existing = readDrops();

      const known = new Set(
        existing.map(record => record.id)
      );

      const added = parsed.filter(
        record => !known.has(record.id)
      );

      if (added.length) {
        writeDrops([...added, ...existing]);

        console.log(
          `DROP PARSED: ${added[0].dungeon} | ` +
          `${added[0].items.length} item entries`
        );
      }
    } catch (error) {
      console.error("Drop ingestion error:", error);
    }
  }

  client.once("ready", async () => {
    console.log(`Discord bot ready: ${client.user.tag}`);

    try {
      const channel = await client.channels.fetch(
        process.env.DISCORD_CHANNEL_ID
      );

      if (!channel || !channel.isTextBased() || !channel.messages) {
        throw new Error("Channel unavailable or not readable.");
      }

      const history = await channel.messages.fetch({
        limit: 100
      });

      let addedCount = 0;

      for (const message of [...history.values()].reverse()) {
        const before = readDrops().length;

        await ingest(message);

        if (readDrops().length > before) {
          addedCount++;
        }
      }

      console.log(
        `Backfill checked ${history.size} messages; ` +
        `added ${addedCount} drop records.`
      );
    } catch (error) {
      console.error("Backfill error:", error.message);
    }
  });

  client.on("messageCreate", message => {
    if (
      message.channelId === process.env.DISCORD_CHANNEL_ID
    ) {
      ingest(message);
    }
  });

  client.on("messageUpdate", (_oldMessage, message) => {
    if (
      message.channelId === process.env.DISCORD_CHANNEL_ID
    ) {
      ingest(message);
    }
  });

  client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error("Discord login failed:", error.message);
  });

} else {
  console.log(
    "Discord listener disabled: configure environment variables."
  );
}
