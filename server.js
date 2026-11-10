
const express = require("express");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "drops.json");
const SUB_FILE = path.join(DATA_DIR, "push-subscriptions.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, "[]");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback = []) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data;
  } catch (err) {
    console.error("Read error:", file, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

function readDrops() {
  const data = readJson(DATA_FILE);
  return Array.isArray(data) ? data : [];
}

function readSubscriptions() {
  const data = readJson(SUB_FILE);
  return Array.isArray(data) ? data : [];
}

function writeDrops(rows) {
  writeJson(DATA_FILE, rows.slice(0, 20000));
}

function clean(s) {
  return String(s || "").replace(/\u0000/g, "").trim();
}

const vapidReady = Boolean(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
);

if (vapidReady) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "https://example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("Web Push configured");
} else {
  console.log("Web Push disabled: configure VAPID environment variables");
}

app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    service: "DQR Drops 2",
    pushConfigured: vapidReady
  });
});

app.get("/api/drops", (_, res) => {
  res.json(readDrops());
});

app.get("/api/push/public-key", (_, res) => {
  if (!vapidReady) {
    return res.status(503).json({ error: "Push notifications are not configured yet." });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/api/push/subscribe", (req, res) => {
  const subscription = req.body?.subscription;
  const preferences = req.body?.preferences || {};

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription." });
  }

  if (!subscription.endpoint.startsWith("https://")) {
    return res.status(400).json({ error: "Invalid subscription endpoint." });
  }

  const subs = readSubscriptions();
  const existing = subs.findIndex(s => s.endpoint === subscription.endpoint);

  const entry = {
    ...subscription,
    preferences: {
      legendary: preferences.legendary !== false,
      ultimate: preferences.ultimate !== false,
      purpleGildenscale: preferences.purpleGildenscale !== false
    },
    updatedAt: new Date().toISOString()
  };

  if (existing >= 0) subs[existing] = entry;
  else subs.push(entry);

  writeJson(SUB_FILE, subs);
  res.json({ ok: true });
});

app.post("/api/push/preferences", (req, res) => {
  const endpoint = req.body?.endpoint;
  const preferences = req.body?.preferences;

  if (!endpoint || !preferences) {
    return res.status(400).json({ error: "Missing endpoint or preferences." });
  }

  const subs = readSubscriptions();
  const sub = subs.find(s => s.endpoint === endpoint);

  if (!sub) return res.status(404).json({ error: "Subscription not found." });

  sub.preferences = {
    legendary: preferences.legendary === true,
    ultimate: preferences.ultimate === true,
    purpleGildenscale: preferences.purpleGildenscale === true
  };
  sub.updatedAt = new Date().toISOString();

  writeJson(SUB_FILE, subs);
  res.json({ ok: true });
});

app.post("/api/push/unsubscribe", (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint." });

  const subs = readSubscriptions().filter(s => s.endpoint !== endpoint);
  writeJson(SUB_FILE, subs);
  res.json({ ok: true });
});

function matchingItems(drop) {
  return (drop.items || []).filter(item => {
    const rarity = String(item.rarity || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();

    return (
      rarity === "legendary" ||
      rarity === "ultimate" ||
      (name.includes("gildenscale") &&
        (rarity === "epic" || rarity === "purple" ||
          String(drop.rawText || "").includes("🟣")))
    );
  });
}

function enabledMatches(drop, preferences) {
  return matchingItems(drop).filter(item => {
    const rarity = String(item.rarity || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();

    if (rarity === "legendary") return preferences.legendary !== false;
    if (rarity === "ultimate") return preferences.ultimate !== false;

    if (
      name.includes("gildenscale") &&
      (rarity === "epic" || rarity === "purple" ||
        String(drop.rawText || "").includes("🟣"))
    ) {
      return preferences.purpleGildenscale !== false;
    }

    return false;
  });
}

async function notifySubscribers(drops) {
  if (!vapidReady || !drops.length) return;

  const subs = readSubscriptions();
  let changed = false;

  for (const sub of subs) {
    const prefs = sub.preferences || {
      legendary: true,
      ultimate: true,
      purpleGildenscale: true
    };

    for (const drop of drops) {
      const matches = enabledMatches(drop, prefs);
      if (!matches.length) continue;

      const names = matches.map(i => {
        const count = Number(i.quantity || 1);
        return `${i.name}${count > 1 ? " ×" + count : ""}`;
      });

      const payload = {
        title: "⚔️ DQR Drop Alert",
        body: names.join(", ").slice(0, 220),
        dungeon: drop.dungeon || "Dungeon Quest",
        boss: drop.boss || "",
        url: drop.sourceUrl || "/",
        tag: "dqr-" + (drop.discordMessageId || drop.id || Date.now())
      };

      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: "high"
        });
      } catch (err) {
        console.error("Push delivery error:", err.statusCode || err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          sub._expired = true;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    writeJson(SUB_FILE, subs.filter(s => !s._expired));
  }
}

function parseMessage(msg) {
  const result = [];

  for (const e of (msg.embeds || [])) {
    const fields = (e.fields || [])
      .map(f => clean(f.name) + "\n" + clean(f.value))
      .join("\n");

    const text = [
      clean(e.title),
      clean(e.description),
      fields
    ].filter(Boolean).join("\n");

    if (!/dungeon|drop|boss|session/i.test(text)) continue;

    const dungeon = (text.match(/Dungeon\s*[:：]\s*([^\n]+)/i) || [])[1] || "";
    const boss = (text.match(/Boss\s*[:：]\s*([^\n]+)/i) || [])[1] || "";
    const accounts = Number((text.match(/Accounts?\s*[:：]\s*(\d+)/i) || [])[1] || 0);

    const items = [];
    const re = /(?:[🟣🟢🔵⚪🟡🔴]\s*)?([^,\n]+?),\s*(Ultimate|Legendary|Epic|Rare|Uncommon|Common)\s*[×x]\s*(\d+)(?:,\s*pot\s*([\d.]+\s*[KMBT]?)\s*(spell|physical)\s*\((\d+)%\))?/gi;

    let m;
    while ((m = re.exec(text)) !== null) {
      const name = clean(m[1]).replace(/^[^\p{L}\p{N}]+/u, "");
      if (name) {
        items.push({
          name,
          rarity: m[2],
          quantity: Math.max(1, Number(m[3]) || 1),
          potential: m[4] ? m[4].replace(/\s+/g, "") + " " + m[5].toLowerCase() : "",
          percent: m[6] ? Number(m[6]) : null
        });
      }
    }

    if (!items.length && !dungeon && !boss) continue;

    result.push({
      id: msg.id + "-" + result.length,
      discordMessageId: msg.id,
      author: msg.author?.username || "Discord",
      timestamp: msg.createdAt?.toISOString?.() || new Date().toISOString(),
      title: clean(e.title) || "Dungeon Quest drops",
      dungeon,
      boss,
      accounts: accounts || null,
      items,
      cleared: (text.match(/(\d+\/\d+\s*cleared\s*\(\d+%\))/i) || [])[1] || "",
      bossWins: (text.match(/([^\n]*\d+\/\d+\s*won\s*\(\d+%\))/i) || [])[1] || "",
      rawText: text,
      sourceUrl: `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}`
    });
  }

  return result;
}

async function ingest(msg, sendNotifications = false) {
  try {
    const fresh = parseMessage(msg);
    if (!fresh.length) return;

    const old = readDrops();
    const ids = new Set(old.map(x => x.id));
    const added = fresh.filter(x => !ids.has(x.id));

    if (added.length) {
      writeDrops([...added, ...old]);
      console.log("Stored " + added.length + " records from " + msg.id);

      if (sendNotifications) {
        await notifySubscribers(added);
      }
    }
  } catch (err) {
    console.error("Ingest error:", err);
  }
}

app.listen(PORT, () => console.log("DQR Drops 2 listening on " + PORT));

if (process.env.DISCORD_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once("ready", async () => {
    console.log("Discord bot ready: " + client.user.tag);

    try {
      const ch = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
      if (!ch || !ch.isTextBased()) throw Error("Channel unavailable");

      const history = await ch.messages.fetch({ limit: 100 });
      for (const msg of [...history.values()].reverse()) {
        await ingest(msg, false);
      }

      console.log("Backfill checked " + history.size + " messages");
    } catch (err) {
      console.error("Channel read error:", err.message);
    }
  });

  client.on("messageCreate", msg => {
    if (msg.channelId === process.env.DISCORD_CHANNEL_ID) {
      ingest(msg, true);
    }
  });

  client.on("messageUpdate", (_, msg) => {
    if (msg.channelId === process.env.DISCORD_CHANNEL_ID) {
      ingest(msg, true);
    }
  });

  client.login(process.env.DISCORD_TOKEN)
    .catch(err => console.error("Discord login failed:", err.message));
} else {
  console.log("Discord listener disabled: configure DISCORD_TOKEN and DISCORD_CHANNEL_ID");
}
