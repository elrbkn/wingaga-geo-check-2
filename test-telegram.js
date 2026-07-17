require('dotenv').config();
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_PROXY_URL } = process.env;

async function main() {
  console.log('TOKEN есть:', !!TELEGRAM_BOT_TOKEN, 'CHAT_ID есть:', !!TELEGRAM_CHAT_ID, 'PROXY:', TELEGRAM_PROXY_URL || '(не задан)');

  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: 'Тестовое сообщение из test-telegram.js' }),
  };

  let tgFetch = fetch;
  if (TELEGRAM_PROXY_URL) {
    const { ProxyAgent, fetch: undiciFetch } = require('undici');
    fetchOptions.dispatcher = new ProxyAgent(TELEGRAM_PROXY_URL);
    tgFetch = undiciFetch;
  }

  console.log('Отправляем...');
  const res = await tgFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, fetchOptions);
  const json = await res.json();
  console.log('Статус:', res.status, 'Ответ:', JSON.stringify(json));
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  if (e.cause) console.error('Причина:', e.cause);
});
