import { useCallback } from "react";
import { en, TranslationKey } from "./en";

export type { TranslationKey };
export type TranslationParams = Record<string, string | number>;

export interface Msg {
  key: TranslationKey;
  params?: TranslationParams;
}

export function translate(key: TranslationKey, params?: TranslationParams): string {
  const template = en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = String(params[name]);
    if (value.startsWith("@") && value.slice(1) in en) return translate(value.slice(1) as TranslationKey);
    return value;
  });
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(key, params);
}

export function msg(key: TranslationKey, params?: TranslationParams): Msg {
  return { key, params };
}

export function useTranslation() {
  const tr = useCallback((key: TranslationKey, params?: TranslationParams) => translate(key, params), []);
  const trMsg = useCallback((m: Msg) => translate(m.key, m.params), []);
  return { t: tr, tMsg: trMsg };
}
