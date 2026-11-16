import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { LegalPage } from "@/components/LegalPage";
import { privacy } from "@/lib/i18n/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Politica de confidențialitate · TeachFlow") };
}

export default function PrivacyPage() {
  return <LegalPage docs={privacy} />;
}
