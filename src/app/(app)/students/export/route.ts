import { loadWorkspace } from "@/lib/data/workspace";
import { csvDateTime, csvResponse, toCsv } from "@/lib/csv";
import { dateKey } from "@/lib/time";

/** Downloads the teacher's students (RLS-scoped) with their active courses as CSV. */
export async function GET() {
  const ws = await loadWorkspace();
  const course = new Map(ws.courses.map(c => [c.id, c.title]));
  const coursesOf = (id: string) => ws.enrollments
    .filter(e => e.student_id === id && e.status === "active")
    .map(e => course.get(e.course_id)).filter(Boolean).join(", ");
  const body = toCsv(
    ["Nume", "Email", "Telefon", "Stare", "Cursuri active", "Note", "Adăugat la"],
    ws.students.map(s => [s.full_name, s.email ?? "", s.phone ?? "", s.status === "active" ? "Activ" : "Inactiv", coursesOf(s.id), s.notes ?? "", csvDateTime(s.created_at, ws.timezone)])
  );
  return csvResponse(`teachflow-elevi-${dateKey(new Date(), ws.timezone)}.csv`, body);
}
