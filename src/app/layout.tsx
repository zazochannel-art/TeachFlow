import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang, getT } from "@/lib/i18n/server";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"], variable: "--font-nunito", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("TeachFlow — Predă mai simplu"),
    description: t("Platforma ta pentru lecții online, elevi și organizarea activității didactice.")
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return <html lang={lang} className={nunito.variable}><body><I18nProvider lang={lang}>{children}</I18nProvider></body></html>;
}
