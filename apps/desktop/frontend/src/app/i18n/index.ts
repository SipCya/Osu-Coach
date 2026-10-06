import { useCallback } from "react";
import { BehaviorSubject } from "rxjs";
import { useObservable } from "rxjs-hooks";
import { ipcRenderer } from "electron";
import { en, TranslationKey } from "./en";
import { it } from "./it";

export type Language = "en" | "it";
export type { TranslationKey };
export type TranslationParams = Record<string, string | number>;

export interface Msg {
  key: TranslationKey;
  params?: TranslationParams;
}

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: "en", name: "English" },
  { id: "it", name: "Italiano" },
];

const STORAGE_KEY = "osucoach-language";
const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, it };

function savedLanguage(): Language | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "it" ? saved : null;
  } catch {
    return null;
  }
}

function initialLanguage(): Language {
  return savedLanguage() ?? (navigator.language.toLowerCase().startsWith("it") ? "it" : "en");
}

export const language$ = new BehaviorSubject<Language>(initialLanguage());

function notifyMainProcess(language: Language) {
  ipcRenderer?.send("languageChanged", language);
}

notifyMainProcess(language$.getValue());

function saveLanguage(language: Language): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
}

export function setLanguage(language: Language) {
  saveLanguage(language);
  language$.next(language);
  notifyMainProcess(language);
}

export function translate(language: Language, key: TranslationKey, params?: TranslationParams): string {
  const template = dictionaries[language][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = String(params[name]);
    if (value.startsWith("@") && value.slice(1) in en) return translate(language, value.slice(1) as TranslationKey);
    return value;
  });
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(language$.getValue(), key, params);
}

export function msg(key: TranslationKey, params?: TranslationParams): Msg {
  return { key, params };
}

export function useTranslation() {
  const language = useObservable(() => language$, language$.getValue());
  const tr = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  const trMsg = useCallback((m: Msg) => translate(language, m.key, m.params), [language]);
  return { t: tr, tMsg: trMsg, language, setLanguage };
}
