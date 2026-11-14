import { LogOut } from "lucide-react";
import { Avatar, Card, DemoNotice, PageHeader, SectionTitle } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { signOut } from "@/lib/actions/settings";
import { SettingsForm } from "./SettingsForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";

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
              currency: ws.teacherProfile?.currency ?? "MDL"
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
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-[12px] font-bold text-muted">{t("Limba")}</span>
            <LanguageSwitcher />
          </div>
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
