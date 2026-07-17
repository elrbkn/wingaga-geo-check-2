// Список стран для ежедневной проверки.
// Чтобы добавить/убрать страну - просто добавьте/удалите объект в массиве ниже.
// code - ISO код страны, используется и в прокси-логине, и в форме регистрации
// name - просто для читаемых отчётов
// phonePrefix - телефонный код страны (для справки/отчётов)
// fakerLocale - локаль для библиотеки @faker-js/faker
// phoneTemplate - РЕАЛЬНЫЙ по формату номер (без "+", без кода страны — только национальная часть)

module.exports = [
  { code: 'HU', name: 'Hungary', phonePrefix: '+36', fakerLocale: 'hu', phoneTemplate: '702699363' },
  { code: 'CH', name: 'Switzerland', phonePrefix: '+41', fakerLocale: 'de_CH', phoneTemplate: '775112923' },
  { code: 'DE', name: 'Germany', phonePrefix: '+49', fakerLocale: 'de_DE', phoneTemplate: '15123456789' },
  { code: 'AT', name: 'Austria', phonePrefix: '+43', fakerLocale: 'de_AT', phoneTemplate: '6504763900' },
  { code: 'BE', name: 'Belgium', phonePrefix: '+32', fakerLocale: 'nl_BE', phoneTemplate: '463001567' },
  { code: 'CZ', name: 'Czech Republic', phonePrefix: '+420', fakerLocale: 'cs_CZ', phoneTemplate: '735592892' },
  { code: 'IT', name: 'Italy', phonePrefix: '+39', fakerLocale: 'it_IT', phoneTemplate: '3780306897' },
  { code: 'SK', name: 'Slovakia', phonePrefix: '+421', fakerLocale: 'sk_SK', phoneTemplate: '947171597' },
  { code: 'IE', name: 'Ireland', phonePrefix: '+353', fakerLocale: 'en_IE', phoneTemplate: '851234567' },
  { code: 'ES', name: 'Spain', phonePrefix: '+34', fakerLocale: 'es', phoneTemplate: '612345678' },
];
