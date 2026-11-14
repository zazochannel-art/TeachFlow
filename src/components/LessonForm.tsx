import { ActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { saveLesson } from "@/lib/actions/lessons";
import type { Workspace } from "@/lib/data/workspace";
import { dateKey, formatTime } from "@/lib/time";
import type { Lesson } from "@/types/database";

export function LessonForm({ ws, lesson, date, courseId, back }: { ws: Workspace; lesson?: Lesson; date: string; courseId?: string; back?: string }) {
  const duration = lesson ? Math.round((new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000) : 60;
  return (
    <ActionForm action={saveLesson} demo={ws.mode === "demo"} submitLabel={lesson ? "Salvează lecția" : "Programează"}>
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <Field label="Curs / grupă" htmlFor="course_id">
        <select id="course_id" name="course_id" className="tf-input" defaultValue={lesson?.course_id ?? courseId ?? ""}>
          <option value="">— fără curs —</option>
          {ws.courses.filter(c => c.is_active || c.id === lesson?.course_id).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      <Field label="Elev (lecție individuală)" htmlFor="student_id">
        <select id="student_id" name="student_id" className="tf-input" defaultValue={lesson?.student_id ?? ""}>
          <option value="">— toată grupa —</option>
          {ws.students.filter(s => s.status === "active" || s.id === lesson?.student_id).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </Field>
      <Field label="Titlu (implicit: numele cursului)" htmlFor="title" wide>
        <input id="title" name="title" defaultValue={lesson?.title ?? ""} className="tf-input" placeholder="ex. Engleză B2 — Present Perfect" />
      </Field>
      <Field label="Data" htmlFor="date"><input id="date" name="date" type="date" required defaultValue={lesson ? dateKey(new Date(lesson.starts_at), ws.timezone) : date} className="tf-input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ora" htmlFor="time"><input id="time" name="time" type="time" required defaultValue={lesson ? formatTime(lesson.starts_at, ws.timezone) : "10:00"} className="tf-input" /></Field>
        <Field label="Durata (min)" htmlFor="duration"><input id="duration" name="duration" type="number" min={15} max={480} step={5} required defaultValue={duration} className="tf-input" /></Field>
      </div>
      <Field label="Link lecție online" htmlFor="meeting_url"><input id="meeting_url" name="meeting_url" type="url" defaultValue={lesson?.meeting_url ?? ""} className="tf-input" placeholder="https://meet.google.com/…" /></Field>
      {!lesson && (
        <Field label="Repetă săptămânal" htmlFor="repeat">
          <select id="repeat" name="repeat" className="tf-input" defaultValue="1">
            <option value="1">O singură dată</option>
            {[2, 4, 8, 12].map(n => <option key={n} value={n}>{n} săptămâni</option>)}
          </select>
        </Field>
      )}
      <Field label="Plan / notițe" htmlFor="description" wide><textarea id="description" name="description" rows={2} defaultValue={lesson?.description ?? ""} className="tf-input" /></Field>
    </ActionForm>
  );
}
