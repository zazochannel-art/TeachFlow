import { notFound } from "next/navigation";
import { VideoCall } from "@/components/board/VideoCall";
import { harnessEnabled } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

/**
 * Automated call test harness (scripts/rtc-e2e). Exists only when the server runs with
 * RTC_TEST_HARNESS=1 and is not on Vercel: everywhere else this page is a 404.
 */
export default async function CallHarness({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const role = sp.role === "teacher" ? "teacher" : "student";
  const id = (sp.id ?? `${role}-1`).replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const lessonId = /^[0-9a-f-]{36}$/.test(sp.lesson ?? "") ? sp.lesson! : "00000000-0000-4000-8000-0000000000aa";
  return (
    <main className="min-h-screen bg-[#F1F2FF] p-6">
      <h1 className="mb-4 text-xl font-extrabold">Call test · {role}</h1>
      <VideoCall
        lessonId={lessonId}
        live
        me={{ id, name: sp.name ?? id, role }}
        teacherId="teacher-1"
        transport={sp.transport === "sfu" ? "sfu" : "p2p"}
        lessonTitle="Test call"
        access={sp.share ? {
          shareReady: true, sharers: sp.share === "on" ? [id] : [],
          students: [{ userId: "student-1", name: "Ana Popescu" }, { userId: null, name: "Mihai Ceban" }]
        } : undefined}
        tokenUrl={`/dev/call/token?id=${id}&name=${encodeURIComponent(sp.name ?? id)}&role=${role}&lesson=${lessonId}`}
      />
    </main>
  );
}
