import type { Metadata } from "next";
import { LessonRoom } from "@/components/board/LessonRoom";
import { loadStudentRoom } from "@/lib/data/board";

export const metadata: Metadata = { title: "Tabla lecției · TeachFlow" };

export default async function StudentLessonRoom({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const room = await loadStudentRoom(lessonId);
  return <LessonRoom room={room} backHref="/student" backLabel="Înapoi acasă" />;
}
