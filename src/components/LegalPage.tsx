import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/time";
import { LEGAL_UPDATED, type LegalDoc } from "@/lib/i18n/legal";
import type { Lang } from "@/lib/i18n/core";

/** Public page for the privacy policy and the terms (no sign-in needed). */
export async function LegalPage({ docs }: { docs: Record<Lang, LegalDoc> }) {
  const t = await getT();
  const doc = docs[t.lang];
  // CONTACT_EMAIL (Vercel env) is the address people write to about their data.
  const contact = process.env.CONTACT_EMAIL || { ro: "echipa TeachFlow", ru: "команда TeachFlow", en: "the TeachFlow team" }[t.lang];
  const fill = (s: string) => s.replaceAll("{contact}", contact);
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/login" className="flex items-center gap-2 text-ink">
            <GraduationCap className="h-7 w-7 text-primary" strokeWidth={1.8} />
            <span className="text-[17px] font-extrabold tracking-tight">TeachFlow</span>
          </Link>
          <LanguageSwitcher />
        </div>
        <article className="rounded-[28px] bg-white p-6 shadow-card md:p-10">
          <h1 className="text-[26px] font-extrabold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-[12px] text-muted">{doc.updated}: {formatDate(`${LEGAL_UPDATED}T12:00:00Z`, "UTC", t.locale)}</p>
          <p className="mt-5 text-[14px] leading-relaxed">{fill(doc.intro)}</p>
          {doc.sections.map(s => (
            <section key={s.h} className="mt-7">
              <h2 className="text-[16px] font-extrabold">{s.h}</h2>
              {s.p.map((p, i) => <p key={i} className="mt-2 text-[13px] leading-relaxed text-ink/85">{fill(p)}</p>)}
            </section>
          ))}
        </article>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}

/** Links to the terms and the privacy policy (auth pages, portals, settings). */
export async function LegalLinks({ className = "" }: { className?: string }) {
  const t = await getT();
  return (
    <p className={`text-center text-[11px] text-muted ${className}`}>
      <Link href="/terms" className="hover:text-primary hover:underline">{t("Termeni de utilizare")}</Link>
      {" · "}
      <Link href="/privacy" className="hover:text-primary hover:underline">{t("Politica de confidențialitate")}</Link>
    </p>
  );
}
