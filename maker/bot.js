const { Telegraf } = require('telegraf');
const fs = require('fs');
require('dotenv').config();

const ADMIN_ID = 7020664469; // your Telegram ID
const bot = new Telegraf("7636762986:AAGUIkm7ASSOUqHs6CT_Dqy9IcdH0Mcppf8");
let videoData = [];

let maintenanceStart = null;
let isBotActive = false;
let editIntervals = {}; // to store intervals per user

function getFormattedTime(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

function getEstimatedWaitTime() {
    if (!maintenanceStart) return '10 minutes';
    const elapsed = Date.now() - maintenanceStart;
    const steps = Math.ceil(elapsed / (10 * 60 * 1000));
    const estimated = steps * 10;
    const remaining = (steps * 10 * 60000) - elapsed;
    return `~${estimated} minutes (⏳ ${getFormattedTime(remaining)} remaining)`;
}

// Command to start the bot
bot.start(async (ctx) => {
    const userId = ctx.from.id;

    // If not admin
    if (userId !== ADMIN_ID) {
        if (!maintenanceStart) maintenanceStart = Date.now();
        const waitTimeMsg = getEstimatedWaitTime();

        const sentMsg = await ctx.reply(`🚧 Bot is under maintenance.\nPlease wait... Estimated wait time: ${waitTimeMsg}`);

        // Start updating the message every second
        const intervalId = setInterval(async () => {
            try {
                const newTime = getEstimatedWaitTime();
                await ctx.telegram.editMessageText(
                    sentMsg.chat.id,
                    sentMsg.message_id,
                    undefined,
                    `🚧 Bot is under maintenance.\nPlease wait... Estimated wait time: ${newTime}`
                );
            } catch (err) {
                clearInterval(intervalId);
                console.error('Edit error or message deleted');
            }
        }, 1000);

        // Save interval so we can clear later if needed
        editIntervals[userId] = intervalId;
        return;
    }

    // If admin
    isBotActive = true;
    maintenanceStart = null;
    ctx.reply('✅ Hello Admin! Send MP4 video to save its details.');
    videoData = [];
    fs.writeFileSync('video_data.txt', '');

    // Clear all intervals for users when admin starts bot
    Object.values(editIntervals).forEach(clearInterval);
    editIntervals = {};
});

// Video handler
bot.on('video', async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID) {
        if (!maintenanceStart) maintenanceStart = Date.now();
        const waitTimeMsg = getEstimatedWaitTime();
        return ctx.reply(`🚧 Bot is under maintenance.\nPlease wait... Estimated wait time: ${waitTimeMsg}`);
    }

    try {
        const file = ctx.message.video;
        const { file_id, file_unique_id, file_size, file_name } = file;

        if (file_name && file_name.endsWith('.mp4')) {
            videoData.push({ file_id, file_unique_id, file_size });

            const data = `File Name: ${file_name}\nFile ID: ${file_id}\nFile Unique ID: ${file_unique_id}\nFile Size: ${file_size}\n\n`;
            fs.appendFileSync('video_data.txt', data, 'utf8');

            ctx.reply(`✅ Video saved!\nFile ID: ${file_id}`);
        } else {
            ctx.reply('❗ Please send an MP4 video.');
        }
    } catch (err) {
        console.error('Video error:', err);
        ctx.reply('❌ Error handling video.');
    }
});

// Launch bot
bot.launch().then(() => {
    console.log('🚀 Bot running');
}).catch(err => {
    console.error('❌ Launch error:', err);
});
