import { ActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { saveCourse } from "@/lib/actions/courses";
import type { Course } from "@/types/database";

export function CourseForm({ demo, course, defaultCurrency = "MDL" }: { demo: boolean; course?: Course; defaultCurrency?: string }) {
  return (
    <ActionForm action={saveCourse} demo={demo} submitLabel={course ? "Salvează" : "Creează cursul"}>
      {course && <input type="hidden" name="id" value={course.id} />}
      <Field label="Nume curs / grupă" htmlFor="title" wide>
        <input id="title" name="title" required minLength={2} defaultValue={course?.title} className="tf-input" placeholder="ex. Engleză B2 — grupa de seară" />
      </Field>
      <Field label="Materie" htmlFor="subject"><input id="subject" name="subject" defaultValue={course?.subject ?? ""} className="tf-input" placeholder="ex. Engleză" /></Field>
      <Field label="Nivel" htmlFor="level"><input id="level" name="level" defaultValue={course?.level ?? ""} className="tf-input" placeholder="ex. B2" /></Field>
      <Field label="Format" htmlFor="format">
        <select id="format" name="format" className="tf-input" defaultValue={course?.format ?? "group"}>
          <option value="group">Grupă</option>
          <option value="individual">Individual</option>
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Preț / lecție" htmlFor="price"><input id="price" name="price" inputMode="decimal" defaultValue={course?.price?.toString() ?? ""} className="tf-input" placeholder="0" /></Field>
        <Field label="Monedă" htmlFor="currency">
          <select id="currency" name="currency" className="tf-input" defaultValue={course?.currency ?? defaultCurrency}>
            {["MDL", "EUR", "RON", "USD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descriere" htmlFor="description" wide><textarea id="description" name="description" rows={3} defaultValue={course?.description ?? ""} className="tf-input" /></Field>
    </ActionForm>
  );
}
