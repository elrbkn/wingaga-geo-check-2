const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Генерируем уникальный идентификатор прогона (на основе времени)
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = path.join(__dirname, '..', 'reports', 'run-results', runId);

// Создаём папку для результатов
fs.mkdirSync(resultsDir, { recursive: true });

// Передаём идентификатор и путь к результатам через переменные окружения
process.env.RUN_ID = runId;
process.env.RESULTS_DIR = resultsDir;

console.log(`[run-daily-check] Запуск тестов (runId=${runId})`);
console.log(`[run-daily-check] Результаты будут сохранены в ${resultsDir}`);

// Запускаем тесты через Patchright
try {
  execSync('npx patchright test', { 
    stdio: 'inherit', 
    env: process.env 
  });
} catch (error) {
  // Тесты могут упасть (например, из-за ожидаемых ошибок регистрации) – 
  // это не критично, мы всё равно собираем отчёт.
  console.warn('[run-daily-check] Тесты завершились с ошибкой, но сборка отчёта продолжится.');
}

// Путь к скрипту сборки отчёта (абсолютный)
const reportScript = path.join(__dirname, 'build-and-send-report.js');

// Проверяем, существует ли файл
if (!fs.existsSync(reportScript)) {
  console.error(`[run-daily-check] Скрипт сборки отчёта не найден: ${reportScript}`);
  process.exit(1);
}

// Запускаем сборку и отправку отчёта, передавая runId
console.log('[run-daily-check] Запуск сборки отчёта...');
execSync(`node "${reportScript}" ${runId}`, { 
  stdio: 'inherit',
  env: process.env 
});

console.log('[run-daily-check] Готово.');