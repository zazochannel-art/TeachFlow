import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { CourseForm } from "@/components/CourseForm";

export default async function NewCoursePage() {
  const ws = await loadWorkspace();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Curs sau grupă nouă" subtitle="Cursul apare imediat în rândul de carduri de pe Dashboard."
        action={<Link href="/courses" className="tf-btn-ghost">Înapoi</Link>} />
      <Card className="p-6">
        <CourseForm demo={ws.mode === "demo"} defaultCurrency={ws.teacherProfile?.currency ?? "MDL"} />
      </Card>
    </div>
  );
}
