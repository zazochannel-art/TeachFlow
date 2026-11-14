import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin", "latin-ext"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "TeachFlow — Predă mai simplu",
  description: "Platforma ta pentru lecții online, elevi și organizarea activității didactice."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ro" className={nunito.variable}><body>{children}</body></html>;
}
