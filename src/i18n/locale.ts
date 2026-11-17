import {
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from './messages';

function isLocale(value: string | null): value is Locale {
  return value === 'zh' || value === 'en';
}

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    // Node / unit-test default keeps the historical Chinese assertions stable.
    return 'zh';
  }
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in private / restricted contexts.
  }
  const browserLanguage =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'zh';
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let activeLocale: Locale = detectInitialLocale();

if (typeof document !== 'undefined') {
  document.documentElement.lang = activeLocale === 'zh' ? 'zh-CN' : 'en';
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persisting the preference is best-effort.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }
}

/** Global translator for pure modules (errors, warnings, canvas labels). */
export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(activeLocale, key, params);
}

/** Locale-aware list separator: `、` in Chinese, `, ` in English. */
export function joinListFor(locale: Locale, items: readonly string[]): string {
  return items.join(locale === 'zh' ? '、' : ', ');
}

export function joinList(items: readonly string[]): string {
  return joinListFor(activeLocale, items);
}
