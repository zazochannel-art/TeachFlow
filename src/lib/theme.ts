export type Theme = "light" | "dark" | "system";
export const THEME_COOKIE = "tf-theme";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark" || v === "system";

/** Runs before first paint when the theme follows the system, so there is no light flash. */
export const SYSTEM_THEME_SCRIPT =
  "try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}";
