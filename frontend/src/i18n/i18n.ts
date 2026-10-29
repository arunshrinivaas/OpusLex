import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import ta from './locales/ta.json';
import ml from './locales/ml.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import hi from './locales/hi.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import bn from './locales/bn.json';
import mr from './locales/mr.json';
import gu from './locales/gu.json';
import pa from './locales/pa.json';
import ar from './locales/ar.json';
import { getLanguageByCode } from './languages';

const savedLanguage = localStorage.getItem('pref_language') || 'en';

if (typeof document !== 'undefined') {
  const langEntry = getLanguageByCode(savedLanguage);
  document.documentElement.dir = langEntry.direction || 'ltr';
  document.documentElement.lang = savedLanguage;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ta: { translation: ta },
      ml: { translation: ml },
      te: { translation: te },
      kn: { translation: kn },
      hi: { translation: hi },
      bn: { translation: bn },
      mr: { translation: mr },
      gu: { translation: gu },
      pa: { translation: pa },
      fr: { translation: fr },
      de: { translation: de },
      ja: { translation: ja },
      ar: { translation: ar },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already safeguards from XSS
    },
  });

export default i18n;
