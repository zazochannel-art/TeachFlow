import Link from "next/link";
import { CreditCard, LogOut } from "lucide-react";
import { Avatar, Card, DemoNotice, PageHeader, SectionTitle } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { signOut } from "@/lib/actions/settings";
import { SettingsForm } from "./SettingsForm";
import { effectivePlan } from "@/lib/plans";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/time";

const subStatus = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;

export default async function SettingsPage() {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
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
              email_reminders: ws.teacherProfile?.email_reminders
            }}
          />
        </Card>
      </div>
      <section>
        <SectionTitle>{t("Cont")}</SectionTitle>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={ws.profile?.avatar_url} size={44} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-extrabold">{name}</div>
              <div className="truncate text-[11px] text-muted">{ws.email ?? "—"}</div>
            </div>
          </div>
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
        {ws.mode === "demo" && <DemoNotice />}
      </section>
    </div>
  );
}
