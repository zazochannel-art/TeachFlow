import Link from "next/link";
import { CreditCard, LogOut } from "lucide-react";
import { Avatar, Card, DemoNotice, PageHeader, SectionTitle } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { signOut } from "@/lib/actions/settings";
import { SettingsForm } from "./SettingsForm";
import { effectivePlan } from "@/lib/plans";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/time";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ThemePicker } from "@/components/theme/ThemeToggle";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push/server";
import { loadTeacherExtras } from "@/lib/data/teacher-extras";
import { ActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { saveInvoiceSettings } from "@/lib/actions/settings";

const subStatus = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;

export default async function SettingsPage() {
  const [ws, t, extras] = await Promise.all([loadWorkspace(), getT(), loadTeacherExtras()]);
  const name = ws.profile?.full_name || t("Profesor");
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <PageHeader title={t("Setări")} subtitle={t("Profilul tău de profesor și preferințele contului")} />
        <Card className="p-6">
          <SettingsForm
            demo={ws.mode === "demo"}
            values={{
              full_name: ws.profile?.full_name ?? "",
              preferred_language: t.lang,
              timezone: ws.timezone,
              headline: ws.teacherProfile?.headline ?? "",
              bio: ws.teacherProfile?.bio ?? "",
              hourly_rate: ws.teacherProfile?.hourly_rate?.toString() ?? "",
              currency: ws.teacherProfile?.currency ?? "MDL",
              email_reminders: ws.teacherProfile?.email_reminders,
              parent_reports: ws.teacherProfile?.parent_reports,
              gamification: extras?.gamification
            }}
          />
        </Card>
        {extras && (
          <div id="facturi" className="mt-8 scroll-mt-6">
            <SectionTitle>{t("Date pentru facturi")}</SectionTitle>
            <Card className="p-6">
              <p className="mb-5 text-[12px] text-muted">{t("Apar pe facturile PDF ale plăților. Fiecare plată primește automat un număr (ex. {no}). Factura nu înlocuiește factura fiscală electronică, dacă ești obligat să o emiți.", { no: `${extras.invoice_prefix}-${new Date().getFullYear()}-0001` })}</p>
              <ActionForm action={saveInvoiceSettings}>
                <Field label={t("Nume sau denumire (pe factură)")} htmlFor="invoice_name"><input id="invoice_name" name="invoice_name" maxLength={160} defaultValue={extras.invoice_name ?? ""} placeholder={ws.profile?.full_name || t("ex. II Popescu Ana")} className="tf-input" /></Field>
                <Field label={t("Cod fiscal (IDNO/IDNP)")} htmlFor="invoice_code"><input id="invoice_code" name="invoice_code" maxLength={40} defaultValue={extras.invoice_code ?? ""} className="tf-input" /></Field>
                <Field label={t("Adresă")} htmlFor="invoice_address" wide><input id="invoice_address" name="invoice_address" maxLength={240} defaultValue={extras.invoice_address ?? ""} className="tf-input" /></Field>
                <Field label={t("Banca")} htmlFor="invoice_bank"><input id="invoice_bank" name="invoice_bank" maxLength={120} defaultValue={extras.invoice_bank ?? ""} placeholder={t("ex. MAIB")} className="tf-input" /></Field>
                <Field label="IBAN" htmlFor="invoice_iban"><input id="invoice_iban" name="invoice_iban" maxLength={40} defaultValue={extras.invoice_iban ?? ""} placeholder="MD24AG000225100013104168" className="tf-input" /></Field>
                <Field label={t("Prefix număr factură")} htmlFor="invoice_prefix"><input id="invoice_prefix" name="invoice_prefix" required maxLength={8} defaultValue={extras.invoice_prefix} className="tf-input uppercase" /></Field>
                <Field label={t("Notă la final (opțional)")} htmlFor="invoice_note"><input id="invoice_note" name="invoice_note" maxLength={300} defaultValue={extras.invoice_note ?? ""} placeholder={t("ex. Mulțumesc pentru încredere!")} className="tf-input" /></Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-soft p-4 sm:col-span-2">
                  <input type="checkbox" name="invoice_email" defaultChecked={extras.invoice_email} className="mt-0.5 h-4 w-4 accent-[#5269e8]" />
                  <span>
                    <span className="block text-[13px] font-bold text-ink">{t("Trimite automat facturile părinților pe email")}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">{t("Când înregistrezi o plată, părinții primesc factura PDF; când o marchezi încasată, primesc factura achitată. Părinții o pot descărca oricând și din portal.")}</span>
                  </span>
                </label>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
      <section>
        <SectionTitle>{t("Cont")}</SectionTitle>
        <Card className="p-5">
          {ws.mode === "live" ? (
            <>
              <AvatarUpload name={name} src={ws.profile?.avatar_url ?? null} size={64} />
              <div className="mt-3 min-w-0">
                <div className="truncate text-[13px] font-extrabold">{name}</div>
                <div className="truncate text-[11px] text-muted">{ws.email ?? "—"}</div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar name={name} src={ws.profile?.avatar_url} size={44} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-extrabold">{name}</div>
                <div className="truncate text-[11px] text-muted">{ws.email ?? "—"}</div>
              </div>
            </div>
          )}
          {/* The TeachFlow subscription lives here (account), not in Finanțe (money from students). */}
          <Link href="/billing" className="mt-5 flex items-center gap-3 rounded-2xl border border-line p-3.5 transition-colors hover:bg-soft">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><CreditCard className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-muted">{t("Abonament TeachFlow")}</span>
              <span className="block text-[14px] font-extrabold">{effectivePlan(ws.subscription).name}</span>
              {ws.subscription && <span className="block text-[10px] text-muted">{t(subStatus[ws.subscription.status])}{ws.subscription.current_period_end ? ` · ${t("până la {date}", { date: formatDate(ws.subscription.current_period_end, ws.timezone, t.locale) })}` : ""}</span>}
              <span className="mt-1 block text-[11px] font-bold text-primary">{t("Schimbă planul")} →</span>
            </span>
          </Link>
          {ws.mode === "live" && (
            <form action={signOut} className="mt-5">
              <button className="tf-btn-ghost w-full"><LogOut className="h-4 w-4" /> {t("Deconectare")}</button>
            </form>
          )}
        </Card>
        <div className="mt-7"><SectionTitle>{t("Notificări pe telefon")}</SectionTitle></div>
        <Card className="p-5"><PushToggle publicKey={ws.mode === "live" ? vapidPublicKey() : null} /></Card>
        <div className="mt-7"><SectionTitle>{t("Aspect")}</SectionTitle></div>
        <Card className="p-5"><ThemePicker /></Card>
        {ws.mode === "demo" && <DemoNotice />}
      </section>
    </div>
  );
}
