/**
 * Comprehensive Acceptance Tests for OpusLex Internationalization & Language Catalogue
 *
 * Verifies:
 * 1. 100+ Valid BCP 47 Language Entries (123 total).
 * 2. Mandated Language Inclusions (Tamil, Malayalam, Telugu, Kannada, Hindi, Bengali,
 *    Marathi, Gujarati, Punjabi, Urdu, Odia, Assamese, German, French, Japanese,
 *    Chinese, Korean, Portuguese, Italian, Arabic, Scottish Gaelic, Irish, Welsh,
 *    Spanish, English).
 * 3. BCP 47 Disambiguation: Scottish Gaelic ('gd') vs Scots ('sco').
 * 4. Native-name search, English search, and BCP 47 code search.
 * 5. Coverage classification: 'full', 'priority', and explicit 'fallback'.
 * 6. Translation bundle key parity, structure, and interpolation placeholders across
 *    all 10 resource bundles.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LANGUAGE_CATALOGUE,
  searchLanguages,
  isSupportedLanguageCode,
  getLanguageByCode,
  getLanguageCoverage,
} from '../languages.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '../locales');

describe('Workstream A1 & A2: Language Catalogue Integrity', () => {
  it('contains more than 100 valid BCP 47 language catalogue entries', () => {
    assert.ok(
      LANGUAGE_CATALOGUE.length >= 100,
      `Expected at least 100 languages, but got ${LANGUAGE_CATALOGUE.length}`
    );
    assert.strictEqual(LANGUAGE_CATALOGUE.length, 129);
  });

  it('guarantees unique BCP 47 codes with no duplicates', () => {
    const codes = LANGUAGE_CATALOGUE.map((l) => l.code);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(
      uniqueCodes.size,
      codes.length,
      'Duplicate language codes found in catalogue'
    );
  });

  it('includes all mandated Dravidian and Indic regional languages', () => {
    const requiredIndic = [
      { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
      { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
      { code: 'te', name: 'Telugu', native: 'తెలుగు' },
      { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
      { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
      { code: 'bn', name: 'Bengali', native: 'বাংলা' },
      { code: 'mr', name: 'Marathi', native: 'मराठी' },
      { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
      { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
      { code: 'ur', name: 'Urdu', native: 'اردو' },
      { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
      { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
    ];

    for (const req of requiredIndic) {
      const entry = getLanguageByCode(req.code);
      assert.ok(entry, `Mandated language ${req.name} (${req.code}) missing from catalogue`);
      assert.strictEqual(entry.name, req.name);
      assert.strictEqual(entry.nativeName, req.native);
    }
  });

  it('includes all mandated Global and Celtic languages', () => {
    const requiredGlobal = [
      { code: 'de', name: 'German' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ko', name: 'Korean' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'it', name: 'Italian' },
      { code: 'ar', name: 'Arabic' },
      { code: 'ga', name: 'Irish' },
      { code: 'cy', name: 'Welsh' },
      { code: 'es', name: 'Spanish' },
      { code: 'en', name: 'English' },
    ];

    for (const req of requiredGlobal) {
      const entry = getLanguageByCode(req.code);
      assert.ok(entry, `Mandated language ${req.name} (${req.code}) missing from catalogue`);
    }
  });

  it('strictly distinguishes Scottish Gaelic (gd) from Scots (sco)', () => {
    const gaelic = getLanguageByCode('gd');
    const scots = getLanguageByCode('sco');

    assert.ok(gaelic, 'Scottish Gaelic (gd) must be present');
    assert.ok(scots, 'Scots (sco) must be present');

    assert.strictEqual(gaelic.code, 'gd');
    assert.strictEqual(gaelic.name, 'Scottish Gaelic');
    assert.strictEqual(gaelic.nativeName, 'Gàidhlig');

    assert.strictEqual(scots.code, 'sco');
    assert.strictEqual(scots.name, 'Scots');
    assert.strictEqual(scots.nativeName, 'Scots');

    assert.notStrictEqual(gaelic.code, scots.code);
    assert.notStrictEqual(gaelic.nativeName, scots.nativeName);
  });

  it('correctly sets RTL script direction for Arabic, Hebrew, Urdu, Persian, and Yiddish', () => {
    const rtlCodes = ['ar', 'he', 'ur', 'fa', 'yi'];
    for (const code of rtlCodes) {
      const entry = getLanguageByCode(code);
      assert.ok(entry, `RTL language ${code} missing`);
      assert.strictEqual(entry.direction, 'rtl', `Expected ${code} to be RTL`);
    }
  });
});

describe('Workstream A2: Search and Persistence Helpers', () => {
  it('searches by English name, native script name, and BCP 47 code', () => {
    // English name search
    const tamilSearch = searchLanguages('Tamil');
    assert.ok(tamilSearch.some((l) => l.code === 'ta'));

    // Native script search
    const malayalamNativeSearch = searchLanguages('മലയാളം');
    assert.ok(malayalamNativeSearch.some((l) => l.code === 'ml'));

    // BCP 47 prefix/exact search
    const deSearch = searchLanguages('de');
    assert.ok(deSearch.some((l) => l.code === 'de'));

    // Scots disambiguation search
    const scoSearch = searchLanguages('Scots');
    assert.ok(scoSearch.some((l) => l.code === 'sco'));
  });

  it('validates supported language codes for safe localStorage persistence', () => {
    assert.strictEqual(isSupportedLanguageCode('en'), true);
    assert.strictEqual(isSupportedLanguageCode('ta'), true);
    assert.strictEqual(isSupportedLanguageCode('gd'), true);
    assert.strictEqual(isSupportedLanguageCode('sco'), true);
    assert.strictEqual(isSupportedLanguageCode('invalid_code_xyz'), false);
    assert.strictEqual(isSupportedLanguageCode(''), false);
  });

  it('correctly reports translation coverage tiers', () => {
    assert.strictEqual(getLanguageCoverage('en'), 'full');
    assert.strictEqual(getLanguageCoverage('es'), 'full');
    assert.strictEqual(getLanguageCoverage('ta'), 'priority');
    assert.strictEqual(getLanguageCoverage('ml'), 'priority');
    assert.strictEqual(getLanguageCoverage('te'), 'priority');
    assert.strictEqual(getLanguageCoverage('kn'), 'priority');
    assert.strictEqual(getLanguageCoverage('hi'), 'priority');
    assert.strictEqual(getLanguageCoverage('bn'), 'priority');
    assert.strictEqual(getLanguageCoverage('mr'), 'priority');
    assert.strictEqual(getLanguageCoverage('gu'), 'priority');
    assert.strictEqual(getLanguageCoverage('pa'), 'priority');
    assert.strictEqual(getLanguageCoverage('fr'), 'priority');
    assert.strictEqual(getLanguageCoverage('de'), 'priority');
    assert.strictEqual(getLanguageCoverage('ja'), 'priority');
    assert.strictEqual(getLanguageCoverage('ar'), 'priority');

    // Unbundled catalogue entries fallback cleanly to English
    assert.strictEqual(getLanguageCoverage('gd'), 'fallback');
    assert.strictEqual(getLanguageCoverage('sco'), 'fallback');
    assert.strictEqual(getLanguageCoverage('is'), 'fallback');
  });
});

describe('Workstream A3: Translation Resource Bundles & Interpolation Parity', () => {
  const bundleFiles = ['en', 'es', 'ta', 'ml', 'te', 'kn', 'hi', 'bn', 'mr', 'gu', 'pa', 'fr', 'de', 'ja', 'ar'];

  it('has all 15 prioritized locale JSON files on disk', () => {
    for (const code of bundleFiles) {
      const filePath = path.join(localesDir, `${code}.json`);
      assert.ok(fs.existsSync(filePath), `Locale bundle ${code}.json not found at ${filePath}`);
    }
  });

  it('ensures all bundles match root namespace structure with English reference', () => {
    const enContent = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8')
    );
    const expectedRootKeys = Object.keys(enContent);

    for (const code of bundleFiles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );
      for (const rootKey of expectedRootKeys) {
        assert.ok(
          rootKey in bundle,
          `Locale ${code}.json is missing root section '${rootKey}'`
        );
        assert.strictEqual(
          typeof bundle[rootKey],
          'object',
          `Expected section '${rootKey}' in ${code}.json to be an object`
        );
      }
    }
  });

  it('preserves key interpolation placeholders across translation bundles', () => {
    const enContent = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8')
    );

    // Verify presence of interpolation markers in reference bundle
    assert.ok(
      enContent.settings.language.catalogCount.includes('{{count}}'),
      'en.json missing {{count}} in settings.language.catalogCount'
    );
    assert.ok(
      enContent.assistantUI.tooltip.includes('{{shortcut}}'),
      'en.json missing {{shortcut}} in assistantUI.tooltip'
    );
    assert.ok(
      enContent.assistantUI.contextBadge.includes('{{section}}'),
      'en.json missing {{section}} in assistantUI.contextBadge'
    );

    // Verify all bundles preserve these essential placeholders
    for (const code of bundleFiles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );
      assert.ok(
        bundle.settings.language.catalogCount.includes('{{count}}'),
        `${code}.json must preserve interpolation token {{count}} in settings.language.catalogCount`
      );
      assert.ok(
        bundle.assistantUI.tooltip.includes('{{shortcut}}'),
        `${code}.json must preserve interpolation token {{shortcut}} in assistantUI.tooltip`
      );
      assert.ok(
        bundle.assistantUI.contextBadge.includes('{{section}}'),
        `${code}.json must preserve interpolation token {{section}} in assistantUI.contextBadge`
      );
    }
  });

  it('enforces 100% recursive key parity with zero missing or extra keys across all 15 bundles', () => {
    const enContent = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8')
    );

    function getLeafKeys(obj: Record<string, any>, prefix = ''): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          Object.assign(result, getLeafKeys(val, fullKey));
        } else {
          result[fullKey] = String(val);
        }
      }
      return result;
    }

    const enLeaves = getLeafKeys(enContent);
    const enKeySet = new Set(Object.keys(enLeaves));

    for (const code of bundleFiles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );
      const bundleLeaves = getLeafKeys(bundle);
      const bundleKeySet = new Set(Object.keys(bundleLeaves));

      const missing = [...enKeySet].filter((k) => !bundleKeySet.has(k));
      const extra = [...bundleKeySet].filter((k) => !enKeySet.has(k));

      assert.strictEqual(
        missing.length,
        0,
        `Bundle ${code}.json is missing keys: ${missing.slice(0, 5).join(', ')} (total ${missing.length})`
      );
      assert.strictEqual(
        extra.length,
        0,
        `Bundle ${code}.json has unexpected extra keys: ${extra.slice(0, 5).join(', ')}`
      );
    }
  });

  it('verifies theme and assistant UI translations are fully defined in all 14 bundles', () => {
    for (const code of bundleFiles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );

      // Verify theme translations exist
      assert.ok(bundle.settings.appearance.theme.light, `[${code}] Missing theme.light`);
      assert.ok(bundle.settings.appearance.theme.dark, `[${code}] Missing theme.dark`);
      assert.ok(bundle.settings.appearance.theme.auto, `[${code}] Missing theme.auto`);

      // Verify assistant UI translations exist
      assert.ok(bundle.assistantUI.listening, `[${code}] Missing assistantUI.listening`);
      assert.ok(bundle.assistantUI.stopListening, `[${code}] Missing assistantUI.stopListening`);
      assert.ok(bundle.assistantUI.switchToText, `[${code}] Missing assistantUI.switchToText`);
      assert.ok(bundle.assistantUI.switchToVoice, `[${code}] Missing assistantUI.switchToVoice`);
      assert.ok(bundle.assistantUI.explainPage, `[${code}] Missing assistantUI.explainPage`);
      assert.ok(bundle.assistantUI.clearHistory, `[${code}] Missing assistantUI.clearHistory`);
      assert.ok(bundle.assistantUI.actionRequiresApproval, `[${code}] Missing assistantUI.actionRequiresApproval`);
    }
  });

  it('fails if non-English priority bundles contain unintended English fallback strings', () => {
    const enContent = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8')
    );

    const nonEnglishBundles = bundleFiles.filter((b) => b !== 'en');
    const checkedKeys = [
      'nav.home',
      'nav.compliance',
      'nav.policies',
      'nav.research',
      'compliance.title',
      'compliance.subtitle',
      'settings.appearance.theme.light',
      'settings.appearance.theme.dark',
      'assistantUI.listening',
      'assistantUI.explainPage'
    ];

    for (const code of nonEnglishBundles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );

      for (const keyPath of checkedKeys) {
        const parts = keyPath.split('.');
        let enVal: any = enContent;
        let locVal: any = bundle;
        for (const p of parts) {
          enVal = enVal?.[p];
          locVal = locVal?.[p];
        }

        assert.notStrictEqual(
          locVal,
          enVal,
          `Locale ${code}.json has unintended English fallback for '${keyPath}': '${locVal}'`
        );
      }
    }
  });

  it('verifies all interpolation variables match English source in all 15 bundles', () => {
    const enContent = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8')
    );

    function getInterpolatedLeafs(obj: Record<string, any>, prefix = ''): Record<string, string[]> {
      const result: Record<string, string[]> = {};
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          Object.assign(result, getInterpolatedLeafs(val, fullKey));
        } else if (typeof val === 'string' && val.includes('{{')) {
          const matches = [...val.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]).sort();
          result[fullKey] = matches;
        }
      }
      return result;
    }

    const enInterpolations = getInterpolatedLeafs(enContent);

    for (const code of bundleFiles) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf-8')
      );
      const bundleInterpolations = getInterpolatedLeafs(bundle);

      for (const [key, enVars] of Object.entries(enInterpolations)) {
        const locVars = bundleInterpolations[key];
        assert.ok(locVars, `[${code}] Key ${key} is missing interpolation variables`);
        assert.deepStrictEqual(
          locVars,
          enVars,
          `[${code}] Interpolation mismatch at ${key}: expected [${enVars}], got [${locVars}]`
        );
      }
    }
  });
});
