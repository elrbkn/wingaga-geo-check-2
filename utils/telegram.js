const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

const TELEGRAM_MESSAGE_LIMIT = 4096;

function buildAxiosClient(proxyUrl) {
  const opts = {};
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    opts.httpAgent = agent;
    opts.httpsAgent = agent;
  }
  return axios.create(opts);
}

function splitMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + line + "\n").length > limit) {
      chunks.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Отправляет текстовое сообщение в конкретный Telegram-чат, разбивая на части при необходимости.
 */
async function sendTelegramMessage({ botToken, proxyUrl }, text, chatId) {
  const client = buildAxiosClient(proxyUrl);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    await client.post(url, {
      chat_id: chatId,
      text: chunk,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }
}

/**
 * Рассылает одно и то же сообщение списку получателей. Ошибка у одного
 * получателя (например, заблокировал бота) не мешает отправке остальным.
 */
async function broadcastTelegramMessage({ botToken, proxyUrl }, text, chatIds) {
  const results = [];
  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage({ botToken, proxyUrl }, text, chatId);
      results.push({ chatId, ok: true });
    } catch (err) {
      results.push({
        chatId,
        ok: false,
        error: err.response?.data?.description || err.message,
      });
    }
  }
  return results;
}

/**
 * Опрашивает Telegram на предмет новых /start с прошлого раза (getUpdates с
 * offset), находит новых подписчиков. offset сдвигает "курсор", чтобы
 * Telegram не присылал одни и те же обновления повторно при каждом запуске.
 */
async function fetchNewStarts({ botToken, proxyUrl }, sinceUpdateId) {
  const client = buildAxiosClient(proxyUrl);
  const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
  const res = await client.get(url, {
    params: { offset: sinceUpdateId + 1, timeout: 0 },
  });

  const updates = res.data.result || [];
  const newChatIds = new Set();
  let maxUpdateId = sinceUpdateId;

  for (const upd of updates) {
    if (upd.update_id > maxUpdateId) maxUpdateId = upd.update_id;
    const msg = upd.message;
    const text = msg && msg.text ? msg.text.trim().toLowerCase() : "";
    if (text.startsWith("/start") && msg.chat && msg.chat.id != null) {
      newChatIds.add(msg.chat.id);
    }
  }

  return { newChatIds: [...newChatIds], maxUpdateId };
}

module.exports = { sendTelegramMessage, broadcastTelegramMessage, fetchNewStarts };