import Link from "next/link";
import { Download } from "lucide-react";
import { ActionForm } from "@/components/forms";
import { Card, SectionTitle } from "@/components/ui";
import { deleteAccount } from "@/lib/actions/account";
import { LegalLinks } from "@/components/LegalPage";
import { createClient } from "@/lib/supabase/server";
import type { T } from "@/lib/i18n/core";

/** "Datele tale": download everything, or delete the account for good (settings / profile pages). */
export async function AccountData({ demo, role, t }: { demo: boolean; role: "teacher" | "student" | "parent"; t: T }) {
  const supabase = demo ? null : await createClient();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const what = role === "teacher"
    ? t("Se șterg definitiv elevii, cursurile, lecțiile, temele, mesajele, plățile, facturile și fișierele tale. Elevii și părinții își păstrează conturile, dar nu te mai văd.")
    : role === "student"
      ? t("Se șterg definitiv contul, profilul și fișierele încărcate de tine. Profesorul păstrează fișa ta de elev, notele și mesajele, dar fără legătură cu acest cont.")
      : t("Se șterg definitiv contul, profilul și legătura cu copiii. Mesajele trimise rămân la profesor, fără legătură cu acest cont.");
  return (
    <>
      <div className="mt-7"><SectionTitle>{t("Datele tale")}</SectionTitle></div>
      <Card className="p-5">
        <p className="text-[12px] text-muted">{t("Poți descărca oricând tot ce ai în TeachFlow, într-un fișier JSON.")}</p>
        <Link href="/account/export" prefetch={false} className="tf-btn-ghost mt-3 w-full"><Download className="h-4 w-4" /> {t("Descarcă datele mele")}</Link>
        <details className="mt-5 rounded-2xl border border-[#f1caca] p-4">
          <summary className="cursor-pointer text-[12px] font-bold text-[#c03a3a]">{t("Șterge contul")}</summary>
          <p className="mt-3 text-[12px] text-muted">{what} {t("Nu se poate anula.")}</p>
          <ActionForm action={deleteAccount} demo={demo} className="mt-3 grid gap-3" submitLabel={t("Șterge contul definitiv")}>
            <label className="text-[12px] font-bold" htmlFor="confirm_email">{t("Scrie emailul contului ({email}) ca să confirmi", { email: email ?? "—" })}</label>
            <input id="confirm_email" name="confirm_email" type="email" required autoComplete="off" className="tf-input" />
          </ActionForm>
        </details>
        <LegalLinks className="mt-4" />
      </Card>
    </>
  );
}
