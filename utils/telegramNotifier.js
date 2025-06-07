// utils/telegramNotifier.js
const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('./supabaseClient'); // For logging notifications

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

let bot;
let canSendMessages = false;

if (token && adminChatId) {
  try {
    bot = new TelegramBot(token); // Polling is not needed for just sending
    canSendMessages = true;
    console.log('[TelegramNotifier] Initialized. Admin notifications enabled.');
  } catch (error) {
    console.error('[TelegramNotifier] Failed to initialize Telegram Bot:', error.message);
    console.log('[TelegramNotifier] Admin notifications disabled due to initialization error.');
  }
} else {
  console.log('[TelegramNotifier] Not initialized due to missing TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID. Admin notifications disabled.');
}

async function logNotificationToDB(message, eventType, details, status) {
    if (!supabase) {
        // console.warn('[TelegramNotifier] Supabase client not available, cannot log notification to DB.');
        return;
    }
    try {
        const { error: logError } = await supabase
            .from('admin_notifications_log')
            .insert({
                event_type: eventType,
                message: message, // Storing the core message, not the full Telegram formatted one
                details: details,
                status: status
            });
        if (logError) {
            console.error('[TelegramNotifier] Failed to log admin notification to DB:', logError.message);
        }
    } catch (dbError) {
        console.error('[TelegramNotifier] Exception while logging admin notification to DB:', dbError.message);
    }
}

async function sendAdminNotification(message, eventType = 'info', details = {}) {
  let dbLogStatus = 'not_logged';

  if (!canSendMessages || !bot) {
    // console.warn('[TelegramNotifier] Cannot send notification: Bot not initialized or disabled.');
    // Log to DB even if bot can't send, if Supabase is available
    // This situation means Telegram env vars were missing or bot init failed.
    dbLogStatus = 'bot_disabled_or_init_failed';
    await logNotificationToDB(message, eventType, details, dbLogStatus);
    return;
  }

  const fullMessage = `🔔 *MCP Admin Alert* 🔔
--------------------------
*Event: \${eventType.toUpperCase()}*

\${message}
--------------------------
Timestamp: \${new Date().toISOString()}\``;

  dbLogStatus = 'pending_send_attempt';
  try {
    await bot.sendMessage(adminChatId, fullMessage, { parse_mode: 'Markdown' });
    console.log(`[TelegramNotifier] Admin notification sent for event: \${eventType}`);
    dbLogStatus = 'sent_successfully';
  } catch (error) {
    console.error(`[TelegramNotifier] Failed to send admin notification via Telegram: \${error.message}`);
    dbLogStatus = 'send_failed_telegram';
    // Optionally, log error details to the 'details' field in DB
    if (typeof details !== 'object' || details === null) details = {};
    details.telegram_send_error = error.message;
  } finally {
    // Log the outcome of the send attempt (or the initial failure to send)
    await logNotificationToDB(message, eventType, details, dbLogStatus);
  }
}

module.exports = { sendAdminNotification };
