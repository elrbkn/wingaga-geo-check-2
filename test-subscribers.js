require('dotenv').config();
const path = require('path');
const { loadSubscribers, saveSubscribers } = require('./utils/subscribers');
const { broadcastTelegramMessage, fetchNewStarts } = require('./utils/telegram');

const SUBSCRIBERS_FILE = path.join(__dirname, 'state', 'subscribers.json');

(async () => {
  const auth = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    proxyUrl: process.env.TELEGRAM_PROXY_URL,
  };

  console.log('--- 1. Читаем текущий список подписчиков ---');
  let { chatIds, lastUpdateId } = loadSubscribers(SUBSCRIBERS_FILE);
  console.log('До обновления:', { chatIds, lastUpdateId });

  console.log('--- 2. Проверяем fetchNewStarts ---');
  const { newChatIds, maxUpdateId } = await fetchNewStarts(auth, lastUpdateId);
  console.log('Новые подписчики:', newChatIds, 'maxUpdateId:', maxUpdateId);

  chatIds = [...new Set([...chatIds, ...newChatIds])];
  lastUpdateId = maxUpdateId;
  saveSubscribers(SUBSCRIBERS_FILE, { chatIds, lastUpdateId });
  console.log('После сохранения:', { chatIds, lastUpdateId });

  console.log('--- 3. Пробуем разослать тестовое сообщение ---');
  const results = await broadcastTelegramMessage(auth, '🧪 Тестовая рассылка из test-subscribers.js', chatIds.length ? chatIds : [process.env.TELEGRAM_CHAT_ID]);
  console.log('Результаты рассылки:', results);
})().catch(e => console.error('Ошибка:', e.response?.data || e.message));