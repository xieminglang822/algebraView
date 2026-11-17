import { useCallback } from 'react';
import { create } from 'zustand';
import { getActiveLocale, setActiveLocale } from './locale';
import {
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from './messages';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: getActiveLocale(),
  setLocale: (locale) => {
    setActiveLocale(locale);
    set({ locale });
  },
  toggleLocale: () => {
    set((state) => {
      const locale: Locale = state.locale === 'zh' ? 'en' : 'zh';
      setActiveLocale(locale);
      return { locale };
    });
  },
}));

export interface Translation {
  locale: Locale;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export function useTranslation(): Translation {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const toggleLocale = useLocaleStore((state) => state.toggleLocale);
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  );
  return { locale, t, setLocale, toggleLocale };
}
