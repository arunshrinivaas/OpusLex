/**
 * OpusLex Scalable Internationalization Language Catalogue
 * 
 * Provides 110+ verified BCP 47 language entries with native script names,
 * English names, regional designations, and translation coverage status.
 */

export type TranslationCoverage = 'full' | 'priority' | 'fallback';

export interface LanguageEntry {
  code: string;           // BCP 47 language identifier
  name: string;           // English name
  nativeName: string;     // Name in native script
  direction?: 'ltr' | 'rtl';
  coverage: TranslationCoverage;
}

export const LANGUAGES: LanguageEntry[] = [
  // ── Baseline Fully Supported Bundles ──────────────────────────────────────
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', coverage: 'full' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', coverage: 'full' },

  // ── Priority Complete Translation Bundles ─────────────────────────────────
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr', coverage: 'priority' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', direction: 'ltr', coverage: 'priority' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', direction: 'ltr', coverage: 'priority' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr', coverage: 'priority' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr', coverage: 'priority' },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', coverage: 'priority' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', coverage: 'priority' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', coverage: 'priority' },

  // ── Indic Languages ───────────────────────────────────────────────────────
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr', coverage: 'priority' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', direction: 'ltr', coverage: 'priority' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr', coverage: 'priority' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr', coverage: 'priority' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl', coverage: 'fallback' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', direction: 'ltr', coverage: 'fallback' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', direction: 'ltr', coverage: 'fallback' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', direction: 'ltr', coverage: 'fallback' },
  { code: 'ks', name: 'Kashmiri', nativeName: 'کٲشُر', direction: 'rtl', coverage: 'fallback' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', direction: 'ltr', coverage: 'fallback' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', direction: 'rtl', coverage: 'fallback' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', direction: 'ltr', coverage: 'fallback' },
  { code: 'kok', name: 'Konkani', nativeName: 'कोंकणी', direction: 'ltr', coverage: 'fallback' },
  { code: 'mai', name: 'Maithili', nativeName: 'मैथिली', direction: 'ltr', coverage: 'fallback' },
  { code: 'mni', name: 'Manipuri', nativeName: 'ꯃꯤꯇꯩꯂꯣꯟ', direction: 'ltr', coverage: 'fallback' },
  { code: 'doi', name: 'Dogri', nativeName: 'डोगरी', direction: 'ltr', coverage: 'fallback' },
  { code: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', direction: 'ltr', coverage: 'fallback' },
  { code: 'brx', name: 'Bodo', nativeName: 'बर\'', direction: 'ltr', coverage: 'fallback' },

  // ── Celtic Languages ──────────────────────────────────────────────────────
  // Distinction: Scottish Gaelic is 'gd'; Scots is 'sco'
  { code: 'gd', name: 'Scottish Gaelic', nativeName: 'Gàidhlig', direction: 'ltr', coverage: 'fallback' },
  { code: 'sco', name: 'Scots', nativeName: 'Scots', direction: 'ltr', coverage: 'fallback' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', direction: 'ltr', coverage: 'fallback' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', direction: 'ltr', coverage: 'fallback' },
  { code: 'br', name: 'Breton', nativeName: 'Brezhoneg', direction: 'ltr', coverage: 'fallback' },
  { code: 'gv', name: 'Manx', nativeName: 'Gaelg', direction: 'ltr', coverage: 'fallback' },

  // ── East Asian & Southeast Asian Languages ────────────────────────────────
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文 (简体)', direction: 'ltr', coverage: 'fallback' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文 (繁體)', direction: 'ltr', coverage: 'fallback' },
  { code: 'yue', name: 'Cantonese', nativeName: '粵語', direction: 'ltr', coverage: 'fallback' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', coverage: 'fallback' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', coverage: 'fallback' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', direction: 'ltr', coverage: 'fallback' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', coverage: 'fallback' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr', coverage: 'fallback' },
  { code: 'fil', name: 'Filipino', nativeName: 'Wikang Filipino', direction: 'ltr', coverage: 'fallback' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Binisaya', direction: 'ltr', coverage: 'fallback' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa', direction: 'ltr', coverage: 'fallback' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda', direction: 'ltr', coverage: 'fallback' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာစာ', direction: 'ltr', coverage: 'fallback' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', direction: 'ltr', coverage: 'fallback' },
  { code: 'lo', name: 'Lao', nativeName: 'ພາສາລາວ', direction: 'ltr', coverage: 'fallback' },
  { code: 'bo', name: 'Tibetan', nativeName: 'བོད་སྐད་', direction: 'ltr', coverage: 'fallback' },
  { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob', direction: 'ltr', coverage: 'fallback' },

  // ── European Languages (Romance, Germanic, Slavic, Finno-Ugric) ───────────
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', coverage: 'fallback' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', coverage: 'fallback' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', direction: 'ltr', coverage: 'fallback' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr', coverage: 'fallback' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', coverage: 'fallback' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr', coverage: 'fallback' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr', coverage: 'fallback' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr', coverage: 'fallback' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', direction: 'ltr', coverage: 'fallback' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', direction: 'ltr', coverage: 'fallback' },
  { code: 'nb', name: 'Norwegian Bokmål', nativeName: 'Norsk bokmål', direction: 'ltr', coverage: 'fallback' },
  { code: 'nn', name: 'Norwegian Nynorsk', nativeName: 'Norsk nynorsk', direction: 'ltr', coverage: 'fallback' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', direction: 'ltr', coverage: 'fallback' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', coverage: 'fallback' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', direction: 'ltr', coverage: 'fallback' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', direction: 'ltr', coverage: 'fallback' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', direction: 'ltr', coverage: 'fallback' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', direction: 'ltr', coverage: 'fallback' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', direction: 'ltr', coverage: 'fallback' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', direction: 'ltr', coverage: 'fallback' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', direction: 'ltr', coverage: 'fallback' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', direction: 'ltr', coverage: 'fallback' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', direction: 'ltr', coverage: 'fallback' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', direction: 'ltr', coverage: 'fallback' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', direction: 'ltr', coverage: 'fallback' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', direction: 'ltr', coverage: 'fallback' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', direction: 'ltr', coverage: 'fallback' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', direction: 'ltr', coverage: 'fallback' },
  { code: 'fo', name: 'Faroese', nativeName: 'Føroyskt', direction: 'ltr', coverage: 'fallback' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', direction: 'ltr', coverage: 'fallback' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', direction: 'ltr', coverage: 'fallback' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', direction: 'ltr', coverage: 'fallback' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', direction: 'ltr', coverage: 'fallback' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', direction: 'ltr', coverage: 'fallback' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch', direction: 'ltr', coverage: 'fallback' },
  { code: 'oc', name: 'Occitan', nativeName: 'Occitan', direction: 'ltr', coverage: 'fallback' },
  { code: 'co', name: 'Corsican', nativeName: 'Corsu', direction: 'ltr', coverage: 'fallback' },
  { code: 'rm', name: 'Romansh', nativeName: 'Rumantsch', direction: 'ltr', coverage: 'fallback' },
  { code: 'la', name: 'Latin', nativeName: 'Latina', direction: 'ltr', coverage: 'fallback' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto', direction: 'ltr', coverage: 'fallback' },

  // ── Middle Eastern & Central Asian Languages ──────────────────────────────
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', coverage: 'priority' },
  { code: 'fa', name: 'Persian (Farsi)', nativeName: 'فارسی', direction: 'rtl', coverage: 'fallback' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl', coverage: 'fallback' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', coverage: 'fallback' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan dili', direction: 'ltr', coverage: 'fallback' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ тілі', direction: 'ltr', coverage: 'fallback' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbekcha', direction: 'ltr', coverage: 'fallback' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', direction: 'ltr', coverage: 'fallback' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', direction: 'ltr', coverage: 'fallback' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmençe', direction: 'ltr', coverage: 'fallback' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', direction: 'rtl', coverage: 'fallback' },
  { code: 'ku', name: 'Kurdish (Kurmanji)', nativeName: 'Kurdî', direction: 'ltr', coverage: 'fallback' },
  { code: 'ckb', name: 'Kurdish (Sorani)', nativeName: 'سۆرانی', direction: 'rtl', coverage: 'fallback' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە', direction: 'rtl', coverage: 'fallback' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', direction: 'ltr', coverage: 'fallback' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', direction: 'ltr', coverage: 'fallback' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол хэл', direction: 'ltr', coverage: 'fallback' },
  { code: 'tt', name: 'Tatar', nativeName: 'Татар теле', direction: 'ltr', coverage: 'fallback' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', direction: 'rtl', coverage: 'fallback' },

  // ── African Languages ─────────────────────────────────────────────────────
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', direction: 'ltr', coverage: 'fallback' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', direction: 'ltr', coverage: 'fallback' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', direction: 'ltr', coverage: 'fallback' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', direction: 'ltr', coverage: 'fallback' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo', direction: 'ltr', coverage: 'fallback' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', direction: 'ltr', coverage: 'fallback' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa', direction: 'ltr', coverage: 'fallback' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', direction: 'ltr', coverage: 'fallback' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaaliga', direction: 'ltr', coverage: 'fallback' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', direction: 'ltr', coverage: 'fallback' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', direction: 'ltr', coverage: 'fallback' },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona', direction: 'ltr', coverage: 'fallback' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho', direction: 'ltr', coverage: 'fallback' },
  { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ', direction: 'ltr', coverage: 'fallback' },

  // ── Indigenous & Other Global Languages ───────────────────────────────────
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi', direction: 'ltr', coverage: 'fallback' },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori', direction: 'ltr', coverage: 'fallback' },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana faʻa Sāmoa', direction: 'ltr', coverage: 'fallback' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl ayisyen', direction: 'ltr', coverage: 'fallback' },
  { code: 'kl', name: 'Greenlandic', nativeName: 'Kalaallisut', direction: 'ltr', coverage: 'fallback' },
];

/**
 * Filter languages by query matching English name, native name, or BCP 47 code.
 */
export function searchLanguages(query: string): LanguageEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return LANGUAGES;
  return LANGUAGES.filter(
    (lang) =>
      lang.name.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q)
  );
}

export const LANGUAGE_CATALOGUE = LANGUAGES;

/**
 * Validates whether a code exists in the catalogue.
 */
export function isSupportedLanguageCode(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}

/**
 * Look up a language entry by code, with safe fallback to English.
 */
export function getLanguageByCode(code: string): LanguageEntry {
  const found = LANGUAGES.find((l) => l.code === code);
  return found || LANGUAGES[0]; // English default
}

/**
 * Returns coverage tier: 'full' | 'priority' | 'fallback'.
 */
export function getLanguageCoverage(code: string): TranslationCoverage {
  const found = LANGUAGES.find((l) => l.code === code);
  return found ? found.coverage : 'fallback';
}
