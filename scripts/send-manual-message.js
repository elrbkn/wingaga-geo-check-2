require('dotenv').config();
const path = require('path');
const { loadSubscribers } = require('../utils/subscribers');
const { broadcastTelegramMessage } = require('../utils/telegram');

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_PROXY_URL } = process.env;
const SUBSCRIBERS_FILE = path.join(__dirname, '..', 'state', 'subscribers.json');

const messageText = process.argv[2];

if (!messageText) {
  console.error('Использование: node scripts/send-manual-message.js "текст сообщения"');
  process.exit(1);
}

(async () => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN не задан');
    process.exit(1);
  }

  const auth = { botToken: TELEGRAM_BOT_TOKEN, proxyUrl: TELEGRAM_PROXY_URL };
  const { chatIds } = loadSubscribers(SUBSCRIBERS_FILE);

  const recipients = [...new Set([
    ...chatIds.map(String),
    ...(TELEGRAM_CHAT_ID ? [String(TELEGRAM_CHAT_ID)] : []),
  ])];

  if (recipients.length === 0) {
    console.warn('⚠️ Список получателей пуст – сообщение не отправлено');
    return;
  }

  const text = `<b>ℹ️ Уведомление от команды</b>\n\n${messageText}`;

  console.log(`Рассылаем сообщение ${recipients.length} получателям...`);
  const results = await broadcastTelegramMessage(auth, text, recipients);

  const failed = results.filter(r => !r.ok);
  console.log(`✅ Разослано ${results.length - failed.length}/${results.length}.`);
  for (const f of failed) {
    console.error(`❌ Не удалось отправить ${f.chatId}: ${f.error}`);
  }
})();