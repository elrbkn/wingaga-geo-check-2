require('dotenv').config();
const { defineConfig } = require('patchright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Увеличено с 60 до 90 секунд: в headed-режиме с реальным WebGL и
  // прохождением Cloudflare Turnstile шаги идут медленнее, чем в чистом
  // headless.
  timeout: 90_000,
  retries: 0, // если тест упал из-за случайного сетевого сбоя — повторить один раз
  workers: 1, // по одной стране за раз (чтобы не путать прокси-сессии)
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/last-run.json' }],
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,

    // ВАЖНО: раньше тест запускался в headless-режиме через облегчённый
    // chrome-headless-shell, у которого нет доступа к GPU ("No available
    // adapters"). Cloudflare Turnstile использует WebGL-сигналы при проверке
    // "это настоящий браузер или бот" и в прошлом прогоне завис навсегда
    // именно из-за этого. headless: false запускает полноценное окно
    // Chromium вместо headless-shell.
    headless: false,
    launchOptions: {
      args: [
        '--use-gl=swiftshader', // программный (софтверный) рендер WebGL вместо отсутствующего GPU
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
      ],
    },
  },
});
