require('dotenv').config();
const { defineConfig } = require('patchright/test');

module.exports = defineConfig({
  testDir: './tests',
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

    headless: false,
    launchOptions: {
      args: [
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
});
