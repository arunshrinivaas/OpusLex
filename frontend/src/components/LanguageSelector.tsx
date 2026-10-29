import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../contexts/PreferencesContext';
import { LANGUAGES, searchLanguages, type LanguageEntry, type TranslationCoverage } from '../i18n/languages';
import { Search, Check, Globe } from 'lucide-react';

export default function LanguageSelector() {
  const { t } = useTranslation();
  const { language, setLanguage } = usePreferences();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLanguages = useMemo(() => {
    return searchLanguages(searchQuery);
  }, [searchQuery]);

  const activeLanguageEntry = useMemo(() => {
    return LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];
  }, [language]);

  const getCoverageBadge = (coverage: TranslationCoverage) => {
    switch (coverage) {
      case 'full':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
            {t('settings.language.coverageFull', 'Complete')}
          </span>
        );
      case 'priority':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
            {t('settings.language.coveragePriority', 'Priority')}
          </span>
        );
      case 'fallback':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-[#262626] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-[#333333]">
            {t('settings.language.coverageFallback', 'English Fallback')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('settings.language.searchPlaceholder', 'Search 110+ languages by English or native name...')}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] rounded-xl text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#FBC648] focus:border-[#FBC648] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Meta Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
          <span>
            {t('settings.language.catalogCount', { count: filteredLanguages.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Active: <strong className="text-neutral-800 dark:text-white">{activeLanguageEntry.name} ({activeLanguageEntry.nativeName})</strong></span>
          {getCoverageBadge(activeLanguageEntry.coverage)}
        </div>
      </div>

      {/* Notice for English fallback languages */}
      {activeLanguageEntry.coverage === 'fallback' && (
        <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span className="font-semibold shrink-0">Note:</span>
          <span>
            {activeLanguageEntry.name} ({activeLanguageEntry.nativeName}) is registered in the catalogue. Full localized interface strings are currently in progress; interface elements gracefully fallback to standard English.
          </span>
        </div>
      )}

      {/* Language Grid */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-2 max-h-[460px] overflow-y-auto divide-y divide-neutral-100 dark:divide-[#262626] transition-colors">
        {filteredLanguages.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">
            {t('settings.language.noResults', 'No matching languages found.')}
          </div>
        ) : (
          filteredLanguages.map((lang: LanguageEntry) => {
            const isSelected = language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                aria-pressed={isSelected}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors cursor-pointer ${
                  isSelected ? 'bg-neutral-100/90 dark:bg-[#262626]' : 'hover:bg-neutral-50 dark:hover:bg-[#212121]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold uppercase ${
                      isSelected
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                        : 'bg-neutral-100 dark:bg-[#212121] text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {lang.code.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">
                        {lang.name}
                      </p>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500 font-normal">
                        ({lang.code})
                      </span>
                    </div>
                    <p
                      className="text-xs text-neutral-500 dark:text-neutral-400 font-normal"
                      dir={lang.direction || 'ltr'}
                    >
                      {lang.nativeName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {getCoverageBadge(lang.coverage)}
                  {isSelected && (
                    <div className="flex items-center gap-1 text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2 py-1 rounded font-medium">
                      <Check className="h-3 w-3" />
                      <span>{t('settings.language.active', 'Active')}</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
