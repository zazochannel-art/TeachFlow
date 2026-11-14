import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { LessonRoom } from "@/components/board/LessonRoom";
import { loadStudentRoom } from "@/lib/data/board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("Tabla lecției")} · TeachFlow` };
}

export default async function StudentLessonRoom({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const t = await getT();
  const room = await loadStudentRoom(lessonId);
  return <LessonRoom room={room} backHref="/student" backLabel={t("Înapoi acasă")} />;
}
