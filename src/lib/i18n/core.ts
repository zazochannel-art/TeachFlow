import { en } from "./en";
import { ru } from "./ru";

export const LANGS = ["ro", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "ro";
export const LANG_COOKIE = "tf_lang";

export const LANG_NAMES: Record<Lang, string> = { ro: "Română", ru: "Русский", en: "English" };
export const LOCALES: Record<Lang, string> = { ro: "ro-RO", ru: "ru-RU", en: "en-GB" };

/** Translations keyed by the Romanian source text. A missing entry falls back to Romanian. */
const DICTS: Record<Lang, Record<string, string>> = { ro: {}, ru, en };

/** Plural categories, in the order the "a|b|c" forms of a key are written for each language. */
const PLURAL_ORDER: Record<Lang, Intl.LDMLPluralRule[]> = {
  ro: ["one", "few", "other"],
  ru: ["one", "few", "many"],
  en: ["one", "other"]
};

export type Vars = Record<string, string | number>;

export interface T {
  (key: string, vars?: Vars): string;
  /** Plural: the key holds forms separated by "|", e.g. "{n} elev|{n} elevi|{n} de elevi". */
  n: (key: string, n: number, vars?: Vars) => string;
  lang: Lang;
  locale: string;
}

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function makeT(lang: Lang): T {
  const dict = DICTS[lang];
  const locale = LOCALES[lang];
  const rules = new Intl.PluralRules(locale);
  const t = ((key: string, vars?: Vars) => fill(dict[key] ?? key, vars)) as T;
  t.n = (key, n, vars) => {
    const forms = (dict[key] ?? key).split("|");
    const order = PLURAL_ORDER[dict[key] ? lang : "ro"];
    const idx = Math.max(0, order.indexOf(rules.select(n)));
    const form = forms[Math.min(idx === -1 ? forms.length - 1 : idx, forms.length - 1)];
    return fill(form, { n, ...vars });
  };
  t.lang = lang;
  t.locale = locale;
  return t;
}

/** Picks the first supported language from an Accept-Language header. */
export function langFromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return null;
}
