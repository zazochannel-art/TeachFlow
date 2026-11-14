"use client";

import { setLanguage } from "@/lib/actions/language";
import { LANGS } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

/** RO / RU / EN switch. `dark` for navy backgrounds. */
export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const t = useT();
  return (
    <form action={setLanguage} className={`inline-flex rounded-full p-0.5 ${dark ? "bg-white/10" : "bg-soft"}`} aria-label={t("Limba")}>
      {LANGS.map(lang => {
        const active = lang === t.lang;
        return (
          <button key={lang} name="lang" value={lang} aria-pressed={active}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
              active ? (dark ? "bg-white text-navy" : "bg-white text-ink shadow-card") : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"
            }`}>
            {lang}
          </button>
        );
      })}
    </form>
  );
}
