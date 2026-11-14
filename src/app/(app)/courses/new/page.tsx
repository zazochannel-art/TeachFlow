import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { CourseForm } from "@/components/CourseForm";
import { getT } from "@/lib/i18n/server";

export default async function NewCoursePage() {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Curs sau grupă nouă")} subtitle={t("Cursul apare imediat în rândul de carduri de pe Dashboard.")}
        action={<Link href="/courses" className="tf-btn-ghost">{t("Înapoi")}</Link>} />
      <Card className="p-6">
        <CourseForm demo={ws.mode === "demo"} defaultCurrency={ws.teacherProfile?.currency ?? "MDL"} />
      </Card>
    </div>
  );
}
