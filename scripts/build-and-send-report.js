require('dotenv').config();
const fs = require('fs');
const path = require('path');

const runId = process.argv[2];
if (!runId) {
  console.error('Не передан runId');
  process.exit(1);
}

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const resultsDir = path.join(REPORT_DIR, 'run-results', runId);
const countries = require('../config/countries');

if (!fs.existsSync(resultsDir)) {
  console.error(`Папка ${resultsDir} не найдена`);
  process.exit(1);
}

const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.warn('Нет файлов результатов');
  process.exit(0);
}

const runResults = files.map(f => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf-8')));

// Добавляем отсутствующие страны
const missing = countries
  .map(c => c.code)
  .filter(code => !runResults.some(r => r.country === code));

for (const code of missing) {
  runResults.push({
    country: code,
    countryName: countries.find(c => c.code === code)?.name || code,
    classification: 'NO_RESULT_FILE',
    note: 'Тест не завершился и не записал результат (возможно, аварийный перезапуск воркера)',
  });
}

// Сохраняем единый отчёт
const dateStr = new Date().toISOString().slice(0, 10);
const reportPath = path.join(REPORT_DIR, `report-${dateStr}.json`);
fs.writeFileSync(reportPath, JSON.stringify(runResults, null, 2), 'utf-8');
console.log(`Отчёт сохранён: ${reportPath}`);

// Формируем текст для Telegram
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_PROXY_URL } = process.env;
const { loadSubscribers, saveSubscribers } = require('../utils/subscribers');
const { broadcastTelegramMessage, fetchNewStarts } = require('../utils/telegram');

const SUBSCRIBERS_FILE = path.join(__dirname, '..', 'state', 'subscribers.json');

const emoji = {
  SUCCESS: '✅',
  SUCCESS_UNCONFIRMED_UI: '⚠️',
};

// Функция экранирования HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Маппинг кодов ошибок на человеко-читаемые сообщения
const errorShortMap = {
  'ERR_CERT_AUTHORITY_INVALID': 'SSL-сертификат недействителен (проблема с прокси или сайтом)',
  'ERR_CONNECTION_CLOSED': 'Соединение разорвано (прокси или сеть)',
  'ERR_CONNECTION_REFUSED': 'Сервер недоступен (отказ соединения)',
  'ERR_TIMED_OUT': 'Таймаут соединения (слишком долгий ответ)',
  'ERR_SSL_PROTOCOL_ERROR': 'Ошибка SSL-протокола',
  'ERR_ABORTED': 'Запрос прерван',
  'ERR_NETWORK_CHANGED': 'Сетевое соединение изменилось',
  'ERR_TUNNEL_CONNECTION_FAILED': 'Ошибка туннеля (прокси)',
  '403': 'HTTP 403 — доступ запрещён (возможно, блокировка)',
  'Cloudflare': 'Cloudflare блокировка (Edge)',
  'CLOUDFLARE_CHALLENGE': 'Cloudflare проверка (капча)',
  'FORM_VALIDATION_ERROR': 'Ошибка валидации формы (некорректные данные)',
  'PHONE_FORMAT_ERROR': 'Ошибка формата телефона',
  'APP_LEVEL_REJECTION': 'Отказ на уровне приложения',
  'PROXY_GEO_MISMATCH': 'Гео-несоответствие прокси',
  'GEO_RESTRICTED_BY_SITE': 'Сайт недоступен для этой страны',
  'NO_REQUEST': 'Запрос регистрации не отправлен',
  'TEST_ERROR': 'Техническая ошибка теста',
};

// Функция сокращения поля note
function shortenNote(note) {
  if (!note) return '';

  // 1. Сначала ищем совпадение с известными кодами ошибок
  for (const [code, msg] of Object.entries(errorShortMap)) {
    if (note.toLowerCase().includes(code.toLowerCase())) {
      return msg;
    }
  }

  // 2. Если не найдено, чистим от логов браузера и длинных трейсов
  let cleaned = note
    .replace(/Call log:[\s\S]*/i, '')          // убираем всё после "Call log:"
    .replace(/Browser logs:[\s\S]*/i, '')      // убираем "Browser logs:"
    .replace(/\[pid=\d+\][\s\S]*?\]/g, '')     // убираем строки с [pid=...]
    .replace(/\n/g, ' ')                       // заменяем переносы на пробелы
    .replace(/\s+/g, ' ')                      // схлопываем пробелы
    .trim();

  // 3. Если после очистки строка пустая, значит ничего полезного не осталось
  if (!cleaned) return 'Ошибка (подробности в логах)';

  // 4. Обрезаем до 150 символов, добавляем многоточие
  const maxLen = 150;
  if (cleaned.length > maxLen) {
    let truncated = cleaned.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.slice(0, lastSpace);
    }
    return truncated + '…';
  }
  return cleaned;
}

// Формируем строки для отчёта
const lines = runResults.map((r) => {
  const icon = emoji[r.classification] || '❌';
  const shortNote = shortenNote(r.note);
  const notePart = shortNote ? ` — ${escapeHtml(shortNote)}` : '';
  return `${icon} ${escapeHtml(r.countryName)} (${escapeHtml(r.country)}): ${escapeHtml(r.classification)}${notePart}`;
});

const total = runResults.length;
const okCount = runResults.filter(r => r.classification === 'SUCCESS').length;
const failCount = total - okCount;

const text =
  `<b>🌍 WinGaga — ежедневная проверка регистрации</b>\n` +
  `<i>${new Date().toISOString()}</i>\n\n` +
  `<b>Итог:</b> ${okCount}/${total} успешно, ${failCount} с ошибками\n\n` +
  lines.join('\n');

// Асинхронная отправка с ожиданием
async function sendTelegram() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ Telegram не настроен – сообщение не отправлено');
    return;
  }

  const auth = { botToken: TELEGRAM_BOT_TOKEN, proxyUrl: TELEGRAM_PROXY_URL };

  // 1. Подтягиваем новых подписчиков (тех, кто написал /start с прошлого раза)
  let { chatIds, lastUpdateId } = loadSubscribers(SUBSCRIBERS_FILE);
  try {
    const { newChatIds, maxUpdateId } = await fetchNewStarts(auth, lastUpdateId);
    if (newChatIds.length > 0) {
      console.log(`🆕 Новые подписчики: ${newChatIds.join(', ')}`);
      chatIds = [...new Set([...chatIds, ...newChatIds])];
    }
    lastUpdateId = maxUpdateId;
    saveSubscribers(SUBSCRIBERS_FILE, { chatIds, lastUpdateId });
  } catch (e) {
    console.error('⚠️ Не удалось обновить список подписчиков:', e.response?.data?.description || e.message);
    // продолжаем с тем списком, что уже был сохранён ранее
  }

  // 2. Резервный получатель на случай, если список подписчиков ещё пуст
  //    (например, самый первый запуск, никто ещё не писал /start)
  const recipients = chatIds.length > 0 ? chatIds : (TELEGRAM_CHAT_ID ? [TELEGRAM_CHAT_ID] : []);

  if (recipients.length === 0) {
    console.warn('⚠️ Список получателей пуст – сообщение не отправлено');
    return;
  }

  console.log(`Рассылаем отчёт ${recipients.length} получателям...`);
  const results = await broadcastTelegramMessage(auth, text, recipients);

  const failed = results.filter(r => !r.ok);
  console.log(`✅ Разослано ${results.length - failed.length}/${results.length} получателям.`);
  for (const f of failed) {
    console.error(`❌ Не удалось отправить ${f.chatId}: ${f.error}`);
  }
}

// Запускаем отправку и ждём завершения
(async () => {
  await sendTelegram();
  console.log('[build-and-send-report] Готово.');
})();