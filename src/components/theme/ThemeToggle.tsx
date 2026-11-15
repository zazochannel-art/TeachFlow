"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";
import { useT } from "@/lib/i18n/client";

function readCookie(): Theme {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]+)`));
  return m && isTheme(m[1]) ? m[1] : "light";
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach(fn => fn());
}

function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readCookie, () => "light");
}

/** Sun / moon button for the top bar: switches between light and dark. */
export function ThemeToggle({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const t = useT();
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"), () => false);
  const label = dark ? t("Mod luminos") : t("Mod întunecat");
  return (
    <button type="button" onClick={() => applyTheme(dark ? "light" : "dark")} aria-label={label} title={label}
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full ${onDark ? "bg-white/10 text-white hover:bg-white/20" : "text-muted hover:bg-soft hover:text-ink"} ${className}`}>
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

/** Three-way choice for the settings page. */
export function ThemePicker() {
  const t = useT();
  const theme = useTheme();
  const options: Array<{ key: Theme; label: string; icon: typeof Sun }> = [
    { key: "light", label: t("Luminos"), icon: Sun },
    { key: "dark", label: t("Întunecat"), icon: Moon },
    { key: "system", label: t("Ca sistemul"), icon: Monitor }
  ];
  return (
    <div role="radiogroup" aria-label={t("Aspect")} className="grid grid-cols-3 gap-2">
      {options.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={theme === o.key} onClick={() => applyTheme(o.key)}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[12px] font-bold ${theme === o.key ? "border-primary bg-tint text-primary-2" : "border-line text-muted hover:bg-soft hover:text-ink"}`}>
          <o.icon className="h-4 w-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}
