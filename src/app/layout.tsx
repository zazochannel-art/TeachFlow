import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang, getT } from "@/lib/i18n/server";
import { cookies, headers } from "next/headers";
import { SYSTEM_THEME_SCRIPT, THEME_COOKIE, isTheme } from "@/lib/theme";
import { ErrorReporter } from "@/components/ErrorReporter";
import { NativeBridge } from "@/components/NativeBridge";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"], variable: "--font-nunito", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("TeachFlow — Predă mai simplu"),
    description: t("Platforma ta pentru lecții online, elevi și organizarea activității didactice."),
    manifest: "/manifest.webmanifest",
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "TeachFlow", statusBarStyle: "black-translucent" }
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [lang, jar, hdrs] = await Promise.all([getLang(), cookies(), headers()]);
  // The CSP (src/proxy.ts) only runs inline scripts that carry this request's nonce.
  const nonce = hdrs.get("x-nonce") ?? undefined;
  const raw = jar.get(THEME_COOKIE)?.value;
  const theme = isTheme(raw) ? raw : "light";
  return (
    <html lang={lang} className={`${nunito.variable}${theme === "dark" ? " dark" : ""}`} suppressHydrationWarning>
      <head>{theme === "system" && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body><I18nProvider lang={lang}>{children}</I18nProvider><ErrorReporter /><NativeBridge /></body>
    </html>
  );
}
