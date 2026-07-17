// Генератор реалистичных тестовых данных для формы регистрации.
// Для каждой страны используется своя локаль Faker, чтобы имена/адреса выглядели
// правдоподобно (антифрод-системы иногда палят совсем "случайные" данные).

const {
  Faker,
  de_AT,
  de_CH,
  nl_BE,
  cs_CZ,
  it_IT,
  sk_SK,
  hu,
  en,
} = require('@faker-js/faker');

// ВАЖНО: используем "en" как запасную локаль, а не "base" — у "base" нет
// данных для многих модулей (например location.streetAddress), из-за чего
// генератор падал с ошибкой "locale data ... are missing". У "en" данные
// полные, поэтому если в целевой локали чего-то не хватает, просто
// подставится английский вариант вместо падения теста.
const localeMap = {
  de_AT: [de_AT, en],
  de_CH: [de_CH, en],
  nl_BE: [nl_BE, en],
  cs_CZ: [cs_CZ, en],
  it_IT: [it_IT, en],
  sk_SK: [sk_SK, en],
  hu: [hu, en],
};

function buildFaker(fakerLocale) {
  const locales = localeMap[fakerLocale] || [en];
  return new Faker({ locale: locales });
}

// Email обязательно на домене @localqa.com — так требует антифрод площадки.
function generateEmail(faker, countryCode) {
  const randomPart = faker.string.alphanumeric({ length: 10 }).toLowerCase();
  const timestamp = Date.now();
  return `qa-${countryCode.toLowerCase()}-${randomPart}${timestamp}@localqa.com`;
}

function generatePassword(faker) {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const specials = '!@#$%';

  // Гарантированные символы
  const guaranteed = [
    lower[Math.floor(Math.random() * lower.length)],      // строчная
    upper[Math.floor(Math.random() * upper.length)],      // заглавная
    digits[Math.floor(Math.random() * digits.length)],    // цифра
    specials[Math.floor(Math.random() * specials.length)] // спецсимвол
  ];

  // Добиваем до общей длины (например, 12)
  const remainingLength = 8; // можно увеличить
  const allChars = lower + upper + digits + specials;
  let rest = '';
  for (let i = 0; i < remainingLength; i++) {
    rest += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Объединяем и перемешиваем
  let password = guaranteed.join('') + rest;
  password = password.split('').sort(() => Math.random() - 0.5).join('');
  return password;
}

function generateBirthday() {
  // Возраст от 21 до 60 лет — чтобы не упереться в edge-кейсы "ровно 18"
  const now = new Date();
  const year = now.getFullYear() - (21 + Math.floor(Math.random() * 39));
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return { day, month, year };
}

// Генерирует национальную часть телефона (без "+", без кода страны) на
// основе РЕАЛЬНОГО по формату шаблона для конкретной страны (см.
// config/countries.js -> phoneTemplate). Уникальность номера не
// валидируется формой, поэтому меняем только последние 3 цифры каждый
// раз - начало номера (оператор/формат/длина, то, что как раз и проверяет
// валидация на сайте) остаётся нетронутым.
function generateMobileNumber(country) {
  const template = country.phoneTemplate;
  if (!template) {
    // запасной вариант, если для страны забыли указать шаблон в config/countries.js
    let digits = '';
    for (let i = 0; i < 9; i++) {
      digits += Math.floor(Math.random() * 10);
    }
    return digits;
  }

  const randomTail = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return template.slice(0, -3) + randomTail;
}

function generateTestData(country) {
  const faker = buildFaker(country.fakerLocale);
  const gender = Math.random() > 0.5 ? 'M' : 'F';

  return {
    email: generateEmail(faker, country.code),
    password: generatePassword(faker),
    firstName: faker.person.firstName(gender === 'M' ? 'male' : 'female'),
    lastName: faker.person.lastName(),
    birthday: generateBirthday(),
    gender,
    city: faker.location.city(),
    address: faker.location.streetAddress(),
    postcode: faker.location.zipCode(),
    // Стартовый номер для первой попытки - при проблеме тест сам
    // сгенерирует новый (с тем же форматом) через generateMobileNumber()
    // и повторит попытку ввода.
    phone: generateMobileNumber(country),
  };
}

module.exports = { generateTestData, generateMobileNumber };
