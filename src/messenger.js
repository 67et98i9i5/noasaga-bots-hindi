const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf("8080886112:AAEi4A5SBK4RG796gvi-oTWMZqFvCGvm3rI");

// file to save channel ID
const CHANNELS_FILE = "./data/channels.json";
let botData = fs.existsSync(CHANNELS_FILE)
  ? JSON.parse(fs.readFileSync(CHANNELS_FILE))
  : { channelId: null };

// Save channel ID
function saveChannel(id) {
  botData.channelId = id;
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(botData, null, 2));
}

// Store user state
let userState = {};

// /start
bot.start((ctx) => {
  if (botData.channelId) {
    ctx.reply("📌 Choose an option:", Markup.inlineKeyboard([
      [Markup.button.callback("🎞 Send Season", "send_season")]
    ]));
  } else {
    ctx.reply("⚠️ Please forward a message from your channel first.");
    userState[ctx.from.id] = { step: "waiting_for_channel" };
  }
});

// Handle forward message to get channel ID
bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId] || {};

  if (state.step === "waiting_for_channel") {
    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === "channel") {
      const channelId = ctx.message.forward_from_chat.id;
      saveChannel(channelId);
      ctx.reply("✅ Channel saved! Now enter the season number:");
      userState[userId] = { step: "waiting_for_season" };
    } else {
      ctx.reply("⚠️ Please forward a message *from a channel*.");
    }
  } 
  else if (state.step === "waiting_for_season") {
    const seasonNum = parseInt(ctx.message.text);
    if (!isNaN(seasonNum) && seasonNum > 0) {
      userState[userId].season = seasonNum;
      userState[userId].step = "waiting_for_episodes";
      ctx.reply("📅 Now enter the number of episodes for this season:");
    } else {
      ctx.reply("⚠️ Please enter a valid season number.");
    }
  }
  else if (state.step === "waiting_for_episodes") {
    const ep = parseInt(ctx.message.text);
    if (!isNaN(ep) && ep > 0) {
      userState[userId].episodes = ep;
      userState[userId].step = "waiting_for_anime_code";
      ctx.reply("🔤 Now enter the anime code:");
    } else {
      ctx.reply("⚠️ Please enter a valid number.");
    }
  } 
  else if (state.step === "waiting_for_anime_code") {
    userState[userId].animeCode = ctx.message.text;
    userState[userId].step = null;
    ctx.reply("🚀 Sending messages...");
    sendSeason(userId, ctx);
  }
});

// Button to trigger flow
bot.action("send_season", (ctx) => {
  userState[ctx.from.id] = { step: "waiting_for_season" };
  ctx.reply("🎯 Enter the season number:");
});

// Send messages
async function sendSeason(userId, ctx) {
  const state = userState[userId];
  const channelId = botData.channelId;
  const animeCode = state.animeCode;
  const season = state.season;
  const episodes = state.episodes;

  for (let ep = 1; ep <= episodes; ep++) {
    const text = `📺 <b>Season ${season} Episode ${ep}</b> 🟢`;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.url("1080p", `https://t.me/noasagaanime_hindi_bot?start=${animeCode}_s${season}_${ep}_1080p`),
        Markup.button.url("360p", `https://t.me/noasagaanime_hindi_bot?start=${animeCode}_s${season}_${ep}_360p`),
        Markup.button.url("720p", `https://t.me/noasagaanime_hindi_bot?start=${animeCode}_s${season}_${ep}_720p`),
      ]
    ]);

    try {
      await bot.telegram.sendMessage(channelId, text, {
        parse_mode: "HTML",
        ...buttons
      });
      await new Promise(res => setTimeout(res, 3000));
    } catch (e) {
      console.log("❌ Error sending message:", e);
    }
  }

  ctx.reply("✅ All episodes sent!");
}

bot.launch();
console.log("🤖 Bot is running...");