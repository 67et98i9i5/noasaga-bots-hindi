const { Telegraf } = require('telegraf');
const axios = require('axios'); 
const fs = require('fs'); 
const path = require('path'); 
require('dotenv').config();
const bot = new Telegraf("");
const User = require("./user"); 
const connectDB = require("./config"); // Import the connection function
const ids = require("../data/ids.json");
connectDB();

const LOG_FILE = path.join(__dirname, '../logs', 'actions.txt');
const DATA_FILE = path.join(__dirname, "../data", "data.json");
const channelLinks = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/channel_links.json"), "utf8"));
const userSelections = {};
const userPageData = {}; // Store current page per 

// ✅ Load anime data from local file first
function loadLocalAnimeData() {
    if (fs.existsSync(DATA_FILE)) {
        animeDataCache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")).anime_list;  // Access anime_list from the local file
        console.log("✅ Loaded anime data from local file.");
    } else {
        console.log("⚠ No local data found, fetching from API...");
        loadAnimeData(true);
    }
}

// 🔄 Fetch anime data every 5-10 minutes
loadLocalAnimeData();


function logActivity(ctx, message) {
    
    const logEntry = `[${new Date().toISOString()}] (${ctx.from.id}) ${ctx.from.first_name}: ${message}\n`;

    // Append log to file
    fs.appendFile(LOG_FILE, logEntry, (err) => {
        if (err) console.error("❌ Error writing log:", err);
    });

    // Print log to console
    console.log(logEntry);
}
// ✅ For 4-arg: animeId, seasonId, episodeId, quality
function getFileIdFromParams(animeId, seasonId, episodeId, quality) {
    for (const anime in animeDataCache) {
        if (animeDataCache[anime].anime_id === animeId) {
            const seasons = animeDataCache[anime];
            for (const season in seasons) {
                if (seasons[season].season_id === seasonId) {
                    const episodes = seasons[season].episodes;
                    for (const ep in episodes) {
                        if (episodes[ep].ep_number === episodeId) {
                            const fileData = episodes[ep].qualities?.[quality];
                            if (fileData?.file_id) {
                                return {
                                    file_id: fileData.file_id,
                                    file_size: fileData.file_size,
                                    season_number: seasonId.replace("s", ""),
                                    episode_number: episodeId,
                                    quality
                                };
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

// ✅ For 3-arg: animeId, seasonId, quality → returns all episodes of a season
function getFileIdsForSeason(animeId, seasonId, quality) {
    const result = [];

    for (const anime in animeDataCache) {
        if (animeDataCache[anime].anime_id === animeId) {
            const seasons = animeDataCache[anime];
            for (const season in seasons) {
                if (seasons[season].season_id === seasonId) {
                    const episodes = seasons[season].episodes;
                    for (const ep in episodes) {
                        const fileData = episodes[ep].qualities?.[quality];
                        if (fileData?.file_id) {
                            result.push({
                                file_id: fileData.file_id,
                                file_size: fileData.file_size,
                                ep_number: episodes[ep].ep_number,
                                season_number: seasonId.replace("s", ""),
                                quality
                            });
                        }
                    }
                }
            }
        }
    }

    return result;
}

function getMalId(animeId) {
    return ids[animeId] || null;
}

const GENRE_NAME_TO_ID = {
    "Action": 1,
    "Adventure": 2,
    "Cars": 3,
    "Comedy": 4,
    "Dementia": 5,
    "Demons": 6,
    "Mystery": 7,
    "Drama": 8,
    "Ecchi": 9,
    "Fantasy": 10,
    "Game": 11,
    "Hentai": 12,
    "Historical": 13,
    "Horror": 14,
    "Kids": 15,
    "Magic": 16,
    "Martial Arts": 17,
    "Mecha": 18,
    "Music": 19,
    "Parody": 20,
    "Samurai": 21,
    "Romance": 22,
    "School": 23,
    "Sci-Fi": 24,
    "Shoujo": 25,
    "Shoujo Ai": 26,
    "Shounen": 27,
    "Shounen Ai": 28,
    "Space": 29,
    "Sports": 30,
    "Super Power": 31,
    "Vampire": 32,
    "Yaoi": 33,
    "Yuri": 34,
    "Harem": 35,
    "Slice of Life": 36,
    "Supernatural": 37,
    "Military": 38,
    "Police": 39,
    "Psychological": 40,
    "Thriller": 41,
    "Seinen": 42,
    "Josei": 43
};

const recommendAnime = async (ctx) => {
    try {
        const userId = ctx.from.id;
        console.log(`🎯 User ${userId} requested anime recommendations`);

        // 🔍 Fetch user from DB
        const user = await User.findOne({ userId });
        if (!user || !user.genreWeights || user.genreWeights.size === 0) {
            return ctx.reply("❌ *Not enough data!* Watch more anime to get recommendations.", { parse_mode: "Markdown" });
        }

        // 📊 Extract & sort genres (fixing Map conversion issue)
        const genreWeightsObj = Object.fromEntries(user.genreWeights.entries());
        const topGenres = Object.entries(genreWeightsObj)
            .sort((a, b) => b[1] - a[1]) // Sort descending
            .slice(0, 3) // Take top 3 genres
            .map(entry => entry[0]);

        console.log(`📊 Top 3 Genres:`, topGenres);

        // 🛑 Convert genre names to IDs
        const genreIds = topGenres.map(genre => GENRE_NAME_TO_ID[genre]).filter(id => id !== undefined);
        if (genreIds.length === 0) {
            return ctx.reply("⚠ *No valid genre IDs found!*", { parse_mode: "Markdown" });
        }

        console.log(`🔢 Mapped Genre IDs:`, genreIds);

        // 🛑 Get a list of already watched anime MAL IDs
        const watchedAnimeIds = new Set(user.watchedAnime.map(a => a.mal_id));

        let recommendedAnime = new Set(); // Using a Set to ensure unique anime

        // 📡 Fetch top anime from Jikan API for each genre
        for (let genreId of genreIds) {
            if (recommendedAnime.size >= 3) break; // Limit to 3 genre-based recommendations

            try {
                const response = await axios.get(`https://api.jikan.moe/v4/anime`, {
                    params: { 
                        genres: genreId,  
                        order_by: "score", 
                        sort: "desc", 
                        limit: 5 
                    }
                });

                const animeList = response.data.data || [];
                console.log(`🔍 Jikan API → Genre ID ${genreId}: Found ${animeList.length} animes`);

                // Filter out watched anime & ensure uniqueness
                animeList.forEach(anime => {
                    if (!watchedAnimeIds.has(anime.mal_id) && !recommendedAnime.has(anime.mal_id) && recommendedAnime.size < 3) {
                        recommendedAnime.add(anime);
                    }
                });

            } catch (error) {
                console.error(`❌ Error fetching anime for genre ID: ${genreId}`, error);
            }
        }

        // 🎯 Fetch 2 most popular anime of the week
        if (recommendedAnime.size < 5) {
            try {
                const response = await axios.get(`https://api.jikan.moe/v4/top/anime`, {
                    params: { 
                        filter: "bypopularity",
                        limit: 10 
                    }
                });

                const popularAnimeList = response.data.data || [];
                console.log(`🔥 Jikan API → Most Popular Anime: Found ${popularAnimeList.length} animes`);

                // Filter out watched anime & ensure uniqueness
                popularAnimeList.forEach(anime => {
                    if (!watchedAnimeIds.has(anime.mal_id) && !recommendedAnime.has(anime.mal_id) && recommendedAnime.size < 5) {
                        recommendedAnime.add(anime);
                    }
                });

            } catch (error) {
                console.error("❌ Error fetching popular anime:", error);
            }
        }

        // Convert Set to Array
        recommendedAnime = [...recommendedAnime];

        if (recommendedAnime.length === 0) {
            return ctx.reply("⚠ *No new anime found!* Try watching more to improve recommendations.", { parse_mode: "Markdown" });
        }

        // 📂 Load channel links JSON
        const channelLinks = require("../data/channel_links.json");

        // 🎭 Format buttons
        const buttons = recommendedAnime.map(anime => {
            const shortTitle = anime.title.length > 25 ? anime.title.substring(0, 22) + "..." : anime.title;
            const link = channelLinks[anime.mal_id] || `https://myanimelist.net/anime/${anime.mal_id}`;
            return [{ text: shortTitle, url: link }];
        });

        // 📨 Send buttons only
        ctx.reply("🎥 *Here's your recommended anime:*", {
            reply_markup: { inline_keyboard: buttons },
            parse_mode: "Markdown"
        });

    } catch (error) {
        console.error("❌ Error in recommendAnime function:", error);
        ctx.reply("⚠ *An error occurred while fetching recommendations!*");
    }
};

bot.start(async (ctx) => {
    logActivity(ctx, "🚀 Bot started");

    const startPayload = ctx.startPayload;
    if (!startPayload) {
        return ctx.reply(
            "👋 *Welcome to the Noasaga Bot!* 🎌\n\n💡 *Browse & download your favorite anime episodes!*",
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🎬 Browse Anime", callback_data: "browse_anime" }],
                        [{ text: "🎯 Recommend Anime", callback_data: "recommend_anime" }]
                    ]
                },
                parse_mode: "Markdown"
            }
        );
    }

    const parts = startPayload.split("_");
    const [animeId, seasonId, episodeIdOrQuality, qualityMaybe] = parts;

    logActivity(ctx, `📥 Payload received: ${startPayload}`);

    const isFourArgs = parts.length === 4;
    const animeIdValid = Boolean(animeId && seasonId);

    if (!animeIdValid || (!episodeIdOrQuality)) {
        return ctx.reply("⚠ *Invalid deep link!*\nMake sure you're using the correct format.", {
            parse_mode: "Markdown"
        });
    }

    try {
        const mal_id = getMalId(animeId);
        if (!mal_id) {
            logActivity(ctx, `❌ MAL ID not found for animeId: ${animeId}`);
            return ctx.reply("❌ *Anime not recognized.*", { parse_mode: "Markdown" });
        }

        const jikanResponse = await axios.get(`https://api.jikan.moe/v4/anime/${mal_id}`);
        const animeData = jikanResponse.data.data;
        const animeTitle = animeData?.title || "Unknown Anime";
        const genres = animeData.genres.map((g) => g.name);

        const userId = ctx.from.id;
        const firstName = ctx.from.first_name;
        const lastName = ctx.from.last_name || "";
        const username = ctx.from.username || "";

        const userData = await User.findOne({ userId });

        if (userData) {
            const existingAnime = userData.watchedAnime.find(
                (anime) => Number(anime.mal_id) === Number(mal_id)
            );
            if (!existingAnime) {
                await User.updateOne(
                    { userId },
                    { $push: { watchedAnime: { mal_id, title: animeTitle, genres } } }
                );
                logActivity(ctx, `✅ Added ${animeTitle} to user ${userId}`);
            } else {
                logActivity(ctx, `⏳ Anime already in watchlist: ${animeTitle}`);
            }
        } else {
            await User.create({
                userId,
                firstName,
                lastName,
                username,
                watchedAnime: [{ mal_id, title: animeTitle, genres }]
            });
            logActivity(ctx, `✅ New user created and anime added: ${animeTitle}`);
        }

        await updateUserGenreStats(userId);

        // ✅ Handle 4-arg deep link
        if (isFourArgs) {
            const [animeId, seasonId, episodeId, quality] = parts;
            const fileObj = getFileIdFromParams(animeId, seasonId, episodeId, quality);

            if (!fileObj) {
                return ctx.reply("⚠ *This episode or quality is currently unavailable.*", {
                    parse_mode: "Markdown"
                });
            }

            await ctx.replyWithVideo(fileObj.file_id, {
                caption: `🎬 *${animeTitle}*\n📺 Episode: *${fileObj.episode_number}*\n📦 Quality: *${quality}* (${fileObj.file_size})\n📚 Season: *${fileObj.season_number}*`,
                parse_mode: "Markdown"
            });
            logActivity(ctx, `✅ Sent Episode ${fileObj.episode_number}`);
            ctx.reply("Thank you very much for using our bot! We hope that you would continue to use our services. Enjoy your Anime!")
        }

        // ✅ Handle 3-arg deep link
        else {
            const [animeId, seasonId, quality] = parts;
            const files = getFileIdsForSeason(animeId, seasonId, quality);

            if (files.length === 0) {
                return ctx.reply("⚠ *No episodes available for this quality.*", {
                    parse_mode: "Markdown"
                });
            }

            logActivity(ctx, `📦 Sending ${files.length} episodes in ${quality}...`);
            for (const file of files) {
                try {
                    await ctx.replyWithVideo(file.file_id, {
                        caption: `🎬 *${animeTitle}*\n📺 Episode: *${file.ep_number}*\n📦 Quality: *${quality}* (${file.file_size})\n📚 Season: *${file.season_number}*`,
                        parse_mode: "Markdown"
                    });
                    logActivity(ctx, `✅ Sent Episode ${file.ep_number}`);
                } catch (err) {
                    logActivity(ctx, `❌ Failed to send Episode ${file.ep_number} → ${err.message}`);
                }
            }
            logActivity(ctx, `✅ All Episode sent Successfully!`);
            ctx.reply("Thank you very much for using our bot! We hope that you would continue to use our services. Enjoy your Anime!")
        }
    } catch (error) {
        logActivity(ctx, `❌ Error in bot.start: ${error.message}`);
        return ctx.reply("❌ *Something went wrong while processing your request.*", {
            parse_mode: "Markdown"
        });
    }
});


function sendAnimeList(ctx) {
    const animeKeys = Object.keys(animeDataCache); // Your anime data

    // Create a list of all anime
    const animeList = animeKeys.map(anime => [{
        text: anime,
        callback_data: `anime_${anime}`
    }]);

    // Send the list of anime as a simple inline keyboard
    ctx.editMessageText("📜 *Choose an anime:* ", {
        reply_markup: { inline_keyboard: animeList },
        parse_mode: "Markdown"
    });
}


const updateUserGenreStats = async (userId) => {
    try {
        const user = await User.findOne({ userId });

        if (!user || !user.watchedAnime || user.watchedAnime.length === 0) {
            console.log(`❌ No watched anime found for user ${userId}`);
            return;
        }

        // 🔢 Count occurrences of each genre
        const genreCounts = new Map();
        let totalAnime = user.watchedAnime.length;

        user.watchedAnime.forEach(anime => {
            if (anime.genres && Array.isArray(anime.genres)) {
                anime.genres.forEach(genre => {
                    genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
                });
            }
        });

        // 📊 Convert counts into percentages
        const genreWeights = {};
        for (const [genre, count] of genreCounts.entries()) {
            genreWeights[genre] = parseFloat(((count / totalAnime) * 100).toFixed(2));
        }

        // 🔄 Update MongoDB (`genreWeights`)
        await User.updateOne({ userId }, { $set: { genreWeights } });

        console.log(`✅ Genre weights updated for user ${userId}:`, genreWeights);
    } catch (error) {
        console.error("❌ Error updating genre weights:", error);
    }
};

bot.action(/anime_(.+)/, async (ctx) => {
    const animeName = ctx.match[1];
    logActivity(ctx, `🎬 Selected Anime: ${animeName}`);

    userSelections[ctx.from.id] = { anime: animeName, season: "", episodes: [] };

    // 🔍 Fetch anime_id from data.json
    const animeInfo = animeDataCache[animeName];
    if (!animeInfo) return ctx.reply("❌ Anime not found.");

    const animeId = animeInfo.anime_id; // Get anime_id
    if (!animeId) {
        logActivity(ctx, `❌ anime_id not found for: ${animeName}`);
        return ctx.reply("⚠ *Could not find anime ID.*", { parse_mode: "Markdown" });
    }

    logActivity(ctx, `✅ Found anime_id: ${animeId}`);

    // 🎌 Fetch MAL ID from ids.json
    const malId = getMalId(animeId);
    if (!malId) {
        logActivity(ctx, `❌ MAL ID not found for anime_id: ${animeId}`);
    } else {
        logActivity(ctx, `✅ Found MAL ID: ${malId}`);
    }

    // 📡 Fetch Anime Details from Jikan API
    try {
        const jikanResponse = await axios.get(`https://api.jikan.moe/v4/anime/${malId}`);
        const animeData = jikanResponse.data.data;
        if (!animeData) return;

        const title = animeData.title;
        const genres = animeData.genres.map(g => g.name);
        logActivity(ctx, `📡 Jikan API → Title: ${title}`);

        // 📝 Store in MongoDB
        const userId = ctx.from.id;
        const firstName = ctx.from.first_name;
        const lastName = ctx.from.last_name || "";
        const username = ctx.from.username || "";

        // 🔍 **Check if User Exists**
        let userData = await User.findOne({ userId });

        if (!userData) {
            logActivity(ctx, `🆕 New user detected! Creating profile for ${firstName}`);
            userData = await User.create({
                userId,
                firstName,
                lastName,
                username,
                watchedAnime: []
            });
        }

        // ✅ **Ensure watchedAnime is an array**
        if (!Array.isArray(userData.watchedAnime)) {
            logActivity(ctx, `❌ watchedAnime is not an array, resetting it.`);
            userData.watchedAnime = [];
        }

        // 🔍 **Check if Anime Already Exists**
        logActivity(ctx, `📂 Checking watchedAnime list: ${JSON.stringify(userData.watchedAnime, null, 2)}`);
        
        const existingAnime = userData.watchedAnime.some(anime => anime.mal_id == malId);
        logActivity(ctx, `🔍 Found existingAnime: ${existingAnime ? "✅ Yes" : "❌ No"}`);                    

        if (existingAnime) {
            logActivity(ctx, `⏳ Anime already in watchlist: ${title} (MAL ID: ${malId}) ❌ Skipping DB insert.`);
        } else {
            logActivity(ctx, `🆕 Adding new anime to watched list: ${title} (MAL ID: ${malId})`);
            await User.updateOne(
                { userId },
                { $push: { watchedAnime: { malId, title, genres } } }
            );
            logActivity(ctx, `✅ Successfully added ${title}`);
        }

        await updateUserGenreStats(userId);

    } catch (error) {
        console.error("❌ Error fetching from Jikan API or saving to DB:", error);
    }

    // 🎭 Show season selection
    const keyboard = Object.keys(animeInfo)
        .filter(key => key !== 'anime_id' && typeof animeInfo[key] === 'object')
        .map(season => [{
            text: season,
            callback_data: `season_${animeName}_${season}`
        }]);

    ctx.editMessageText(`📌 Select a season from **${animeName}**:`, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ✅ Handle season selection
bot.action(/season_(.+)_(.+)/, (ctx) => {
    const [animeName, seasonName] = ctx.match.slice(1);
    logActivity(ctx, `Selected Season: ${seasonName} from ${animeName}`);

    userSelections[ctx.from.id].season = seasonName;
    userSelections[ctx.from.id].episodes = [];

    sendEpisodeSelection(ctx, animeName, seasonName);
});

// ✅ Send episodes with toggle selection
function sendEpisodeSelection(ctx, animeName, seasonName) {
    const { episodes } = userSelections[ctx.from.id];

    const keyboard = Object.keys(animeDataCache[animeName][seasonName].episodes).map(ep => [{
        text: `${episodes.includes(ep) ? "✅" : "❌"} ${ep}`,
        callback_data: `toggle_episode_${animeName}_${seasonName}_${ep}`
    }]);

    keyboard.push([{ text: "✔ Confirm Selection", callback_data: "confirm_multi_selection" }]);

    ctx.editMessageText(`📺 Select episodes from **${seasonName}**:`, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// ✅ Handle episode toggle
bot.action(/toggle_episode_(.+)_(.+)_(.+)/, (ctx) => {
    const [animeName, seasonName, episodeName] = ctx.match.slice(1);
    let { episodes } = userSelections[ctx.from.id];

    if (episodes.includes(episodeName)) {
        episodes = episodes.filter(ep => ep !== episodeName);
    } else {
        episodes.push(episodeName);
    }

    userSelections[ctx.from.id].episodes = episodes;
    sendEpisodeSelection(ctx, animeName, seasonName);
});

// ✅ Confirm episode selection and ask for quality
bot.action("confirm_multi_selection", (ctx) => {
    const { anime, season, episodes } = userSelections[ctx.from.id];

    if (!episodes.length) return ctx.reply("❌ Please select at least one episode.");

    logActivity(ctx, `Confirmed Multi Episodes: ${episodes.join(", ")}`);
    
    const firstEpisodeData = animeDataCache[anime][season].episodes[episodes[0]];
    if (!firstEpisodeData || !firstEpisodeData.qualities) {
        return ctx.reply("❌ No available qualities for the selected episodes.");
    }

    const keyboard = Object.keys(firstEpisodeData.qualities).map(q => [{
        text: q,
        callback_data: `multi_quality_${anime}_${season}_${q}`
    }]);

    ctx.reply("🎥 Select a quality for all selected episodes:", {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// 🎞️ Improved Episode & Quality Selection
bot.action(/multi_quality_(.+)_(.+)_(.+)/, async (ctx) => {
    const [animeName, seasonName, quality] = ctx.match.slice(1);
    logActivity(ctx, `Selected Multi Quality: ${quality}`);
    ctx.reply("⏳ *Processing your request...*", { parse_mode: "Markdown" });

    const userData = userSelections[ctx.from.id] || { episodes: [] };
    const episodes = userData.episodes || [];

    if (!episodes.length) return ctx.reply("⚠ *No episodes selected!*", { parse_mode: "Markdown" });

    await ctx.reply(`📥 *Downloading ${episodes.length} episodes in* **${quality}** *quality...*`, { parse_mode: "Markdown" });

    for (const ep of episodes) {
        const fileData = animeDataCache[animeName]?.[seasonName]?.episodes?.[ep]?.qualities?.[quality];

        if (!fileData || (fileData.file_id === "" && fileData.file_url === "N/A")) {
            await ctx.reply(`⚠ *Episode ${ep} is unavailable in ${quality}.*`, { parse_mode: "Markdown" });
        } else {
            const fileSize = fileData.file_size || "Unknown Size";
            const infoText = `📺 *Episode ${ep}*\n📂 **Size:** ${fileSize}\n🎞 **Quality:** *${quality}*`;

            if (fileData.file_id) {
                await ctx.replyWithVideo(fileData.file_id, { caption: infoText, parse_mode: "Markdown" });
            } else {
                await ctx.reply(`${infoText}\n\n📥 *Download it here:*`, {
                    reply_markup: { inline_keyboard: [[{ text: "⬇ Download", url: fileData.file_url }]] },
                    parse_mode: "Markdown"
                });
            }
        }
    }

    await updateUserGenreStats(ctx.from.id);

    await ctx.reply("🔄 *Want to select more anime?*", {
        reply_markup: { inline_keyboard: [[{ text: "🎬 Browse More", callback_data: "browse_anime" }]] },
        parse_mode: "Markdown"
    });

    // Reset user selection after processing
    userSelections[ctx.from.id] = { episodes: [] };
});

bot.action("recommend_anime", (ctx) => {
    logActivity(ctx, "🎯 User requested anime recommendations");
    recommendAnime(ctx);
});


bot.action("continue_bot", (ctx) => {
    logActivity(ctx, "User chose to continue the bot");
    sendAnimeList(ctx);
});

bot.action("browse_anime", (ctx) => {
    sendAnimeList(ctx, 1);
});


// ℹ Updated "About" Command
bot.command('about', (ctx) => {
    ctx.reply(`
🚀 *Welcome to Noasaga Project!* 🚀  

💖 *A global anime community built by fans, for fans!* 🎌✨  

🔹 *Join our Telegram community:* [Noasaga Anime](https://t.me/NoasagaAnime)  
🔹 *Follow us on Instagram:* [@sakura_dessuu](https://www.instagram.com/sakura_dessuu)  
🔹 *Subscribe on YouTube:* [CatWithHat08](https://www.youtube.com/@catwithhat08)  
🔹 *Visit our Official Website:* [Noasaga Project](https://noasaga-project.onrender.com)  

🎭 *Enjoy streaming & downloading anime hassle-free!*
`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

//ADMIN SECTIONN

// 🔹 Reset queue (Clear pending messages)
async function resetQueue() {
    try {
        pendingMessages = {}; // Clear in-memory queue
        console.log('✅ Cleared all pending Telegram queues.');
    } catch (error) {
        console.error('❌ Error resetting queue:', error.message);
    }
}

// 🔹 Command to manually reset queue (Admin only)
bot.command('resetqueue', async (ctx) => {
    if (ctx.from.id === 7020664469) { // Replace with your admin ID
        await resetQueue();
        ctx.reply('✅ Queue has been reset.');
    } else {
        ctx.reply('❌ You are not authorized to reset the queue.');
    }
});

// 🔹 Handle unexpected errors (Prevents bot from crashing)
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

// 🔹 Middleware to ignore 403 errors
bot.use(async (ctx, next) => {
    try {
        await next(); // Process message normally
    } catch (error) {
        if (error.response && error.response.error_code === 403) {
            console.log(`🚨 User ${ctx.chat.id} blocked the bot. Ignoring message.`);
        } else {
            console.error('❌ Telegram Error:', error.message);
        }
    }
});

(async () => {
    try {
      await bot.telegram.deleteWebhook(); // ❌ Unset 
      await bot.telegram.deleteWebhook(); // ❌ Unset webhook
      await bot.telegram.deleteWebhook(); // ❌ Unset webhook
      await bot.telegram.deleteWebhook(); // ❌ Unset webhook
      await bot.launch(); // ✅ Start bot in polling mode
      console.log("✅ Bot is running!");
    } catch (error) {
      console.error("❌ Bot failed to launch:", error);
    }
  })();  