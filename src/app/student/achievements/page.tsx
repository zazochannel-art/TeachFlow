import { Card, DemoNotice, PageHeader, SectionTitle } from "@/components/ui";
import { BadgeGrid, PointHistory, PointRules, ProgressSummary, StreakDays } from "@/components/ProgressView";
import { loadStudentPortal } from "@/lib/data/student";
import { demoProgress, loadPortalProgress } from "@/lib/data/progress";
import { getT } from "@/lib/i18n/server";

/** Points, level, streak and badges of the signed-in student (migration 0015). */
export default async function StudentAchievements() {
  const [p, t] = await Promise.all([loadStudentPortal(), getT()]);
  const progress = p.mode === "demo" ? demoProgress(p, p.timezone) : await loadPortalProgress(p.links, p.timezone);

  if (!progress) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-[20px] font-extrabold">{t("Realizări")}</h1>
        <p className="mt-2 text-[13px] text-muted">{t("Punctele și insignele nu sunt activate de profesorul tău.")}</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("Realizările mele")} subtitle={t("Câștigi puncte pentru teme, teste și lecții. Adună insigne și nu pierde seria!")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <ProgressSummary p={progress} t={t} />
          <StreakDays p={progress} t={t} />
          <section>
            <SectionTitle>{t("Insigne · {n} din {total}", { n: progress.badges.filter(b => b.earned).length, total: progress.badges.length })}</SectionTitle>
            <BadgeGrid p={progress} t={t} />
          </section>
        </div>
        <aside className="space-y-8">
          <section><SectionTitle>{t("Puncte câștigate")}</SectionTitle><PointHistory p={progress} t={t} tz={p.timezone} /></section>
          <section><SectionTitle>{t("Cum câștigi puncte")}</SectionTitle><PointRules t={t} /></section>
        </aside>
      </div>
      {p.mode === "demo" && <DemoNotice />}
    </div>
  );
}
