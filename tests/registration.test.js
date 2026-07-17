require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============= ИЗМЕНЕНИЕ №1: импорт из patchright вместо @playwright/test =============
const { test, expect, devices } = require('patchright/test');
// Для прямого запуска браузера тоже используем patchright
const playwright = require('patchright');
// =====================================================================================

const countries = require('../config/countries');
const { generateTestData, generateMobileNumber } = require('../utils/dataGenerator');

const {
  SOAX_HOST,
  SOAX_PORT,
  SOAX_LOGIN_PREFIX,
  SOAX_LOGIN_SUFFIX,
  SOAX_PASSWORD,
  REGISTRATION_URL,
  TELEGRAM_BOT_TOKEN,      
  TELEGRAM_CHAT_ID,
  TELEGRAM_PROXY_URL,       
} = process.env;

function generateSessionId(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

const REPORT_DIR = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// маппинг locale/timezone/geo по странам
const localeByCountry = {
  AT: 'de-AT', CH: 'de-CH', BE: 'nl-BE', CZ: 'cs-CZ',
  IT: 'it-IT', SK: 'sk-SK', HU: 'hu-HU',
  ES: 'es-ES',
};

const timezoneByCountry = {
  AT: 'Europe/Vienna', CH: 'Europe/Zurich', BE: 'Europe/Brussels',
  CZ: 'Europe/Prague', IT: 'Europe/Rome', SK: 'Europe/Bratislava', HU: 'Europe/Budapest',
  ES: 'Europe/Madrid',
};

const geoByCountry = {
  AT: { latitude: 48.2082, longitude: 16.3738 },
  CH: { latitude: 47.3769, longitude: 8.5417 },
  BE: { latitude: 50.8503, longitude: 4.3517 },
  CZ: { latitude: 50.0755, longitude: 14.4378 },
  IT: { latitude: 41.9028, longitude: 12.4964 },
  SK: { latitude: 48.1486, longitude: 17.1077 },
  HU: { latitude: 47.4979, longitude: 19.0402 },
  ES: { latitude: 40.4168, longitude: -3.7038 },
};

const dialCodeMap = {
  'CZ': '420',
  'AT': '43',
  'BE': '32',
  'DE': '49',
  'PL': '48',
  'SK': '421',
  'CH': '41',
  'NL': '31',
  'FR': '33',
  'IT': '39',
  'ES': '34',
  'PT': '351',
  'GB': '44',
  'IE': '353',
  'DK': '45',
  'NO': '47',
  'SE': '46',
  'FI': '358',
  'HU': '36',
  'RO': '40',
  'BG': '359',
  'GR': '30',
  'HR': '385',
  'SI': '386',
};

// Длинные случайные задержки (2-5 сек)
async function randomDelay(min = 2000, max = 5000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(r => setTimeout(r, delay));
}

async function closePossiblePopups(page, maxAttempts = 3) {
  const popupSelectors = [
    '.modal',
    '.popup',
    '[role="dialog"]',
    '.registration-modal',
    '.modal-overlay',
    '[data-testid="btnAcceptCookies"]',
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let found = false;
    for (const selector of popupSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible({ timeout: 5000 }).catch(() => false)) {
        found = true;
        if (selector === '[data-testid="btnAcceptCookies"]') {
          await element.click();
          console.log('Баннер куки закрыт');
        } else {
          const closeBtn = element.locator('button:has-text("Close"), button[aria-label="Close"], .close, [data-testid="close-popup"]');
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await closeBtn.click();
            console.log(`Закрыто всплывающее окно (${selector})`);
          } else {
            await page.tap('body', { position: { x: 10, y: 10 } }).catch(() => {});
          }
        }
        await randomDelay(1000, 2000);
      }
    }
    if (!found) break;
    await randomDelay(1000, 1500);
  }
}

async function clickRadioByLabel(page, radioId) {
  const radio = page.locator(`#${radioId}`);
  const label = page.locator(`label[for="${radioId}"]`);
  if (await label.isVisible({ timeout: 3000 }).catch(() => false)) {
    await label.tap();
  } else {
    const parent = page.locator(`#${radioId}`).locator('xpath=..');
    if (await parent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await parent.tap();
    } else {
      await radio.check({ force: true });
    }
  }
  await randomDelay(1000, 2000);
}

async function retryAction(action, maxAttempts = 3, delay = 2000) {
  let lastError;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await action();
      return;
    } catch (e) {
      lastError = e;
      await randomDelay(delay, delay + 1000);
    }
  }
  throw lastError;
}

// Основная функция теста
async function runTestForCountry(country, browser) {
  const testData = generateTestData(country);
  const sessionId = generateSessionId();
  const proxyLogin =
    `${SOAX_LOGIN_PREFIX}-${country.code.toLowerCase()}` +
    `-sessionid-${sessionId}-sessionlength-600-bindttl-30-${SOAX_LOGIN_SUFFIX}`;

  const locale = localeByCountry[country.code] || 'en-US';

  const context = await browser.newContext({
    ...devices['Pixel 7'],
    ...(country.code === 'ES'
      ? {}
      : {
          userAgent: '...',
          extraHttpHeaders: {
            'Accept-Language': `${locale},en;q=0.5`,
            'Accept-Encoding': 'gzip, deflate, br',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
          },
        }),

    ...(country.code === 'ES' && {
      extraHttpHeaders: {
        'Accept-Language': `${locale},en;q=0.5`,
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }),
    proxy: {
     server: `http://${SOAX_HOST}:${SOAX_PORT}`,
     username: proxyLogin,
     password: SOAX_PASSWORD,
   },
    locale,
   timezoneId: timezoneByCountry[country.code],
   geolocation: geoByCountry[country.code],
   permissions: ['geolocation'],
   headless: false,
   viewport: { width: 412, height: 915 },
   hasTouch: true,
  });

  // ===== СОЗДАЁМ СТРАНИЦУ =====
  const page = await context.newPage();

  // ===== ВЫПОЛНЯЕМ STEALTH-СКРИПТ В КОНТЕКСТЕ СТРАНИЦЫ =====
  await page.evaluate((locale) => {
    // Подделываем chrome object
    window.chrome = {
        runtime: {},
        loadTimes() {},
        csi() {},
        app: {},
    };

    // Permissions API для уведомлений
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);

    // Подмена ширины/высоты окна
    Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
    Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });

    // Подделка информации о сети
    if (navigator.connection) {
        Object.defineProperty(navigator, 'connection', {
            get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10 }),
        });
    }

    // Подмена WebGL-вендора и рендерера (маскировка под Qualcomm Adreno)
    const getParameterProxy = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Qualcomm';
        if (parameter === 37446) return 'Adreno (TM) 730';
        return getParameterProxy.apply(this, arguments);
    };

    const getParameter2Proxy = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Qualcomm';
        if (parameter === 37446) return 'Adreno (TM) 730';
        return getParameter2Proxy.apply(this, arguments);
    };

    console.log('Stealth-скрипт выполнен');
  }, locale);
  // ===== КОНЕЦ EVALUATE =====

  const result = {
    country: country.code,
    countryName: country.name,
    timestamp: new Date().toISOString(),
    proxySessionId: sessionId,
    classification: 'UNKNOWN',
    httpStatus: null,
    cfRay: null,
    bodySnippet: null,
    landingDomain: null,
    landingLocale: null,
    detectedCountryField: null,
    detectedCurrencyField: null,
    uiConfirmedLogin: false,
    allCapturedApiErrors: [],
    phoneUsed: null,
    note: '',
    retry: false,
  };

  let signupCaptured = false;
  const capturedApiErrors = [];

  try {
    console.log(`[${country.code}] Проверяем IP...`);
    let ipInfo = {};
    try {
      const ipResponse = await page.request.get('https://ipapi.co/json/', { timeout: 20_000 });
      ipInfo = await ipResponse.json();
    } catch (e) {
      console.log(`[${country.code}] Не удалось проверить IP через ipapi.co: ${e.message}`);
    }

    if (ipInfo.country_code && ipInfo.country_code !== country.code) {
      result.classification = 'PROXY_GEO_MISMATCH';
      result.note = `Прокси отдал IP страны ${ipInfo.country_code}, а ожидали ${country.code}`;
      throw new Error(result.note);
    }

    console.log(`[${country.code}] Настраиваем перехват API...`);
    page.on('response', async (response) => {
      const req = response.request();
      const url = response.url();
      const status = response.status();

      // Пропускаем всё, что не относится к API
      if (!url.includes('/api/')) return;

      // Успешные ответы
      if (status < 400) {
        if (url.includes('/registration/signup') && req.method() === 'POST') {
          signupCaptured = true;
          result.httpStatus = status;
          result.classification = 'SUCCESS';
          console.log(`[${country.code}] ✅ API ответил успешно (status ${status})`);
        }
        return;
      }

      // Ошибочные ответы
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      const server = headers['server'] || '';
      const cfRay = headers['cf-ray'] || null;

      let body = '';
      try {
        body = await response.text();
      } catch (e) {
        body = '';
      }

      const isCloudflareBlock =
        status === 403 &&
        server.toLowerCase() === 'cloudflare' &&
        contentType.includes('text/html') &&
        /blocked|attention required|security service|доступ временно ограничен|access is temporarily restricted/i.test(body);

      // Все ошибки сохраняем в лог
      capturedApiErrors.push({
        url,
        status,
        cfRay,
        isCloudflareBlock,
        bodySnippet: body.slice(0, 300),
      });

      const isSignupCall = url.includes('/registration/signup') && req.method() === 'POST';
      if (isSignupCall) signupCaptured = true;

      // ===== ИЗМЕНЕНИЕ: Cloudflare-блок считаем значимым только для signup-запроса =====
      if (isCloudflareBlock && isSignupCall) {
        result.classification = 'CLOUDFLARE_EDGE_BLOCK';
        result.httpStatus = status;
        result.cfRay = cfRay;
        result.bodySnippet = body.slice(0, 500);
        result.note = `${result.note} | Cloudflare-блок пойман на ${url}`.trim();
        console.log(`[${country.code}] ⚠️ Cloudflare блок на ${url}`);
      } else if (isSignupCall && result.classification === 'UNKNOWN') {
        // Любая другая ошибка на signup-запросе — считаем отказом приложения
        result.classification = 'APP_LEVEL_REJECTION';
        result.httpStatus = status;
        result.bodySnippet = body.slice(0, 500);
        console.log(`[${country.code}] ❌ Ошибка приложения на ${url}`);
      }
    });

    console.log(`[${country.code}] Открываем страницу регистрации...`);
    await page.goto(REGISTRATION_URL, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 4000);

    const pageText = await page.locator('body').innerText();
    if (/доступ временно ограничен|access denied|blocked|attention required|access is temporarily restricted/i.test(pageText)) {
      result.classification = 'CLOUDFLARE_CHALLENGE';
      result.note = 'Страница регистрации перехвачена Cloudflare (доступ ограничен)';
      const screenshotPath = path.join(REPORT_DIR, `blocked-${country.code}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = screenshotPath;
      throw new Error(result.note);
    }

    if (/access restricted|is not available for your country for legal reasons/i.test(pageText)) {
      result.classification = 'GEO_RESTRICTED_BY_SITE';
      result.note = `Продукт сам заблокировал доступ для гео ${country.code} (legal reasons) — не связано с антифродом/Cloudflare`;
      const screenshotPath = path.join(REPORT_DIR, `restricted-${country.code}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = screenshotPath;
      throw new Error(result.note);
    }

    const landingUrl = new URL(page.url());
    result.landingDomain = landingUrl.hostname;
    result.landingLocale = landingUrl.pathname.split('/').filter(Boolean)[0] || null;

    await closePossiblePopups(page);
    await randomDelay(1000, 2000);

    try {
      await page.getByTestId('btnAcceptCookies').click({ timeout: 8_000 });
      console.log(`[${country.code}] Баннер cookies закрыт (ранний)`);
      await randomDelay(1000, 2000);
    } catch (e) {
      console.log(`[${country.code}] Баннер cookies не найден (ранний)`);
    }

    console.log(`[${country.code}] Выбираем бонус...`);
    await retryAction(async () => {
      await page.getByRole('button', { name: /^choose$/i }).tap({ timeout: 15_000 });
    });
    await randomDelay(1000, 2000);

    // --- Шаг 5. Registration 1/2 ---
    console.log(`[${country.code}] Заполняем email и пароль...`);
    const emailField = page.getByPlaceholder(/enter e-?mail/i);
    await emailField.click();
    await emailField.pressSequentially(testData.email, { delay: 60 + Math.random() * 60 });
    await randomDelay(1000, 2000);

    const passwordField = page.getByPlaceholder(/enter password/i);
    await passwordField.click();
    await passwordField.pressSequentially(testData.password, { delay: 60 + Math.random() * 60 });

    const consentCheckboxes = page.getByRole('checkbox');
    const checkboxCount = await consentCheckboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      const box = consentCheckboxes.nth(i);
      if (!(await box.isChecked())) {
        await box.check();
        await randomDelay(500, 1000);
      }
    }

    await closePossiblePopups(page);

    const nextStepBtn = page.getByRole('button', { name: /next step/i });
    await nextStepBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await nextStepBtn.isEnabled({ timeout: 5_000 });

    let secondStepLoaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[${country.code}] Попытка ${attempt} клика Next Step...`);
      await retryAction(async () => {
        await nextStepBtn.tap();
      });
      await randomDelay(2000, 3000);
      const nameField = page.getByTestId('name');
      const isVisible = await nameField.isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) {
        secondStepLoaded = true;
        break;
      }
      await closePossiblePopups(page);
      await randomDelay(1000, 2000);
    }

    if (!secondStepLoaded) {
      throw new Error('Не удалось перейти на второй шаг регистрации после 3 попыток');
    }
    console.log(`[${country.code}] Второй шаг загружен`);

    // --- Шаг 6. Registration 2/2 ---
    console.log(`[${country.code}] Заполняем личные данные...`);
    await page.getByTestId('name').fill(testData.firstName);
    await randomDelay(1000, 2000);
    await page.getByTestId('surname').fill(testData.lastName);
    await randomDelay(1000, 2000);

    const { day, month, year } = testData.birthday;
    const dobString = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    await page.getByTestId('birthday').fill(dobString);
    await randomDelay(1000, 2000);

    if (testData.gender === 'M') {
      await clickRadioByLabel(page, 'genderMale');
    } else {
      await clickRadioByLabel(page, 'genderFemale');
    }

    try {
      result.detectedCountryField = await page.getByTestId('country').innerText({ timeout: 3_000 });
      result.detectedCurrencyField = await page.getByTestId('currency').innerText({ timeout: 3_000 });
    } catch (e) {}

    // Телефон
    console.log(`[${country.code}] Заполняем телефон...`);
    const phoneInput = page.getByTestId('phone');
    const phoneErrorLocator = page.locator("text=/phone number isn't formatted correctly|invalid phone|incorrect phone|phone.*invalid/i");

    const dialCode = dialCodeMap[country.code];
    if (!dialCode) throw new Error(`Неизвестный телефонный код для ${country.code}`);
    const prefix = `+${dialCode}`;
    const prefixLength = prefix.length;

    function getLocalNumber(fullNumber, dialCode) {
      const dialStr = dialCode.toString();
      let local = fullNumber.replace(/^\+/, '');
      if (local.startsWith(dialStr)) {
        local = local.slice(dialStr.length);
      }
      return local;
    }

    let phoneAccepted = false;
    let lastPhoneTried = testData.phone;
    const MAX_PHONE_ATTEMPTS = 4;

    for (let attempt = 1; attempt <= MAX_PHONE_ATTEMPTS; attempt++) {
      const fullCandidate = attempt === 1 ? testData.phone : generateMobileNumber(country);
      lastPhoneTried = fullCandidate;
      const localCandidate = getLocalNumber(fullCandidate, dialCode);

      const currentValue = await phoneInput.inputValue().catch(() => '');
      if (!currentValue.startsWith(prefix)) {
        await phoneInput.fill(prefix);
        await randomDelay(500, 1000);
      }

      await phoneInput.click();
      await phoneInput.evaluate((el, prefLen) => {
        el.setSelectionRange(prefLen, el.value.length);
      }, prefixLength);
      await page.keyboard.press('Delete');
      await randomDelay(500, 1000);

      await phoneInput.pressSequentially(localCandidate, { delay: 120 });
      await randomDelay(1000, 1500);

      const hasVisibleError = await phoneErrorLocator.isVisible().catch(() => false);
      const actualRaw = await phoneInput.inputValue().catch(() => '');
      const actualDigitsOnly = actualRaw.replace(/\D/g, '');
      const expectedDigitsOnly = (prefix + localCandidate).replace(/\D/g, '');
      const valueCorrupted = actualDigitsOnly !== expectedDigitsOnly;

      if (!hasVisibleError && !valueCorrupted) {
        phoneAccepted = true;
        break;
      }
      await randomDelay(1000, 1500);
    }

    result.phoneUsed = lastPhoneTried;
    if (!phoneAccepted) {
      result.classification = 'PHONE_FORMAT_ERROR';
      result.note = `${result.note} | Не удалось корректно ввести номер телефона за ${MAX_PHONE_ATTEMPTS} попыток (последний пробовали: ${lastPhoneTried})`.trim();
      throw new Error(result.note);
    }

    // Адрес
    console.log(`[${country.code}] Ожидаем появления поля City...`);
    const cityInput = page.getByTestId('city');
    await cityInput.waitFor({ state: 'visible', timeout: 10_000 });
    await randomDelay(1000, 2000);

    await closePossiblePopups(page);

    console.log(`[${country.code}] Заполняем City...`);
    await cityInput.scrollIntoViewIfNeeded();
    await cityInput.fill(testData.city, { timeout: 5_000 });
    await randomDelay(1000, 2000);

    const addressInput = page.getByTestId('address');
    console.log(`[${country.code}] Заполняем Address...`);
    await addressInput.scrollIntoViewIfNeeded();
    await addressInput.fill(testData.address, { timeout: 5_000 });
    await randomDelay(1000, 2000);

    const postcodeInput = page.getByTestId('postcode');
    console.log(`[${country.code}] Заполняем Postcode...`);
    await postcodeInput.scrollIntoViewIfNeeded();
    await postcodeInput.fill(testData.postcode, { timeout: 5_000 });
    await randomDelay(1000, 2000);

    // Валидация
    console.log(`[${country.code}] Проверяем ошибки валидации...`);
    const validationErrorLocator = page.locator('text=/mandatory|invalid|required|incorrect format/i');
    const validationErrorCount = await validationErrorLocator.count({ timeout: 3_000 }).catch(() => 0);
    if (validationErrorCount > 0) {
      const messages = await validationErrorLocator.allInnerTexts();
      result.classification = 'FORM_VALIDATION_ERROR';
      result.note = `${result.note} | Форма подсветила ошибки валидации: ${messages.join(' | ')}`.trim();
      throw new Error(`Форма не прошла клиентскую валидацию: ${messages.join(' | ')}`);
    }

    // Отправка
    console.log(`[${country.code}] Ожидаем активации кнопки регистрации...`);

    await closePossiblePopups(page);
    await randomDelay(1000, 2000);
    await closePossiblePopups(page);
    await randomDelay(1000, 1500);

    const registerBtn = page.getByTestId('btn-register');
    await registerBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await registerBtn.isEnabled({ timeout: 5_000 });
    console.log(`[${country.code}] Кликаем Create Account...`);
    await registerBtn.tap();
    console.log(`[${country.code}] Кнопка нажата, ожидаем ответа...`);

    await randomDelay(3000, 5000);

    console.log(`[${country.code}] Проверяем, был ли зафиксирован ответ...`);
    let waitTime = 0;
    const maxWait = 25_000;
    while (waitTime < maxWait) {
      if (signupCaptured || result.classification !== 'UNKNOWN') {
        console.log(`[${country.code}] Ответ получен: signupCaptured=${signupCaptured}, classification=${result.classification}`);
        break;
      }
      console.log(`[${country.code}] Ждём ответ... прошло ${waitTime/1000} сек`);
      await randomDelay(1500, 2000);
      waitTime += 2000;
    }

    await randomDelay(2000, 3000);

    if (!signupCaptured && result.classification === 'UNKNOWN') {
      result.classification = 'NO_REQUEST';
      result.note = `${result.note} | Запрос на /registration/signup не был зафиксирован за ${maxWait/1000} секунд`.trim();
      console.log(`[${country.code}] ❌ Ответ не получен, классификация NO_REQUEST`);
    }

    if (result.classification === 'SUCCESS') {
      console.log(`[${country.code}] Проверяем, закрылась ли модалка регистрации...`);
      const registrationModalStillOpen = await page
        .locator('.registration-modal')
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (registrationModalStillOpen) {
        result.classification = 'SUCCESS_UNCONFIRMED_UI';
        result.note = `${result.note} | API вернул успешный статус, но модалка регистрации не закрылась - логин не подтверждён визуально`.trim();
        console.log(`[${country.code}] ⚠️ Модалка всё ещё открыта`);
      } else {
        result.uiConfirmedLogin = true;
        console.log(`[${country.code}] ✅ Регистрация успешна! Модалка закрыта`);
      }
    }

    result.allCapturedApiErrors = capturedApiErrors;
    console.log(`[${country.code}] Тест завершён, результат: ${result.classification}`);
  } catch (err) {
    result.classification = result.classification === 'UNKNOWN' ? 'TEST_ERROR' : result.classification;
    result.note = `${result.note} | Ошибка выполнения теста: ${err.message}`.trim();
    result.allCapturedApiErrors = capturedApiErrors;
    console.error(`[${country.code}] Ошибка:`, err.message);

    const screenshotPath = path.join(REPORT_DIR, `error-${country.code}-${Date.now()}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = screenshotPath;
      console.log(`[${country.code}] Скриншот сохранён: ${screenshotPath}`);
    } catch (e) {}
  } finally {
    await context.close();
    const resultsDir = process.env.RESULTS_DIR || path.join(REPORT_DIR, 'run-results', 'fallback');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultFile = path.join(resultsDir, `${country.code}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8');
  }

  return result;
}

// ============= ИЗМЕНЕНИЕ №2: использование playwright из patchright для запуска браузера =============
for (const country of countries) {
  test(`Registration check - ${country.name} (${country.code})`, async () => {
  let result;
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    console.log(`[${country.code}] Попытка ${retryCount + 1} из ${maxRetries + 1}`);

    const browser = await playwright.chromium.launch({
      headless: false,
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
    });

    try {
      result = await runTestForCountry(country, browser);
    } finally {
      await browser.close().catch(() => {});
    }

    if (
      result.classification === 'CLOUDFLARE_CHALLENGE' ||
      result.classification === 'CLOUDFLARE_EDGE_BLOCK' ||
      result.classification === 'GEO_RESTRICTED_BY_SITE'
    ) {
      retryCount++;
      if (retryCount <= maxRetries) {
        console.log(`[${country.code}] Обнаружена блокировка, повторная попытка с новым IP...`);
        continue;
      }
    }
    break;
  }

  expect(
    result.classification,
    `Гео ${country.code} (${result.landingDomain || 'домен не определён'}): ${result.classification} | ${result.note}`
  ).toBe('SUCCESS');
});
};