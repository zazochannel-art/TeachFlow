import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { LegalPage } from "@/components/LegalPage";
import { terms } from "@/lib/i18n/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Termeni de utilizare · TeachFlow") };
}

export default function TermsPage() {
  return <LegalPage docs={terms} />;
}
