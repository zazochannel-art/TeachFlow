import Constants from "expo-constants";

/**
 * The TeachFlow web app that the Android app shows. Same site, same accounts, same data as
 * https://teach-flow-nine.vercel.app — the app adds native push, file sharing and the back button.
 * Override with EXPO_PUBLIC_WEB_URL (e.g. a preview deployment or a custom domain).
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || "https://teach-flow-nine.vercel.app").replace(/\/+$/, "");
export const WEB_HOST = new URL(WEB_URL).host;

export const APP_VERSION = Constants.expoConfig?.version ?? "0";

/** Background colours of the web app's canvas, used around the page (status bar, loading, offline). */
export const COLORS = {
  light: { canvas: "#f1f2ff", ink: "#20234b", muted: "#858ba8", primary: "#5269e8", panel: "#ffffff" },
  dark: { canvas: "#0e1027", ink: "#e9ebff", muted: "#8f95b9", primary: "#6377f0", panel: "#161935" }
} as const;
export type Palette = (typeof COLORS)[keyof typeof COLORS];

/** True when `url` is a page of the TeachFlow site (stays inside the app); anything else opens outside. */
export function isOwnUrl(url: string) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host === WEB_HOST;
  } catch {
    return false;
  }
}

/** A path from a notification ("/student/lesson/…") turned into a full URL on the site. */
export function siteUrl(path: unknown) {
  if (typeof path !== "string" || !path) return null;
  if (path.startsWith("/") && !path.startsWith("//")) return WEB_URL + path;
  return isOwnUrl(path) ? path : null;
}
