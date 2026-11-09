import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeachFlow — Predă mai simplu",
  description: "Platforma ta pentru lecții online, elevi și organizarea activității didactice."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ro"><body>{children}</body></html>;
}
