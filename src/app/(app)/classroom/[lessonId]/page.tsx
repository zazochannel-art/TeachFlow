import type { Metadata } from "next";
import { LessonRoom } from "@/components/board/LessonRoom";
import { loadTeacherRoom } from "@/lib/data/board";

export const metadata: Metadata = { title: "Tabla lecției · TeachFlow" };

export default async function TeacherLessonRoom({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const room = await loadTeacherRoom(lessonId);
  return <LessonRoom room={room} backHref="/classroom" backLabel="Înapoi la lecții online" />;
}
