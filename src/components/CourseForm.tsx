import { ActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { saveCourse } from "@/lib/actions/courses";
import type { Course } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import { COURSE_PALETTE } from "@/lib/colors";

export async function CourseForm({ demo, course, defaultCurrency = "MDL", colors = false, autoColor }: {
  demo: boolean; course?: Course; defaultCurrency?: string;
  /** Show the colour picker (migration 0011 applied, or demo). */
  colors?: boolean;
  /** Colour the course gets when none is picked. */
  autoColor?: string;
}) {
  const t = await getT();
  return (
    <ActionForm action={saveCourse} demo={demo} submitLabel={course ? t("Salvează") : t("Creează cursul")}>
      {course && <input type="hidden" name="id" value={course.id} />}
      <Field label={t("Nume curs / grupă")} htmlFor="title" wide>
        <input id="title" name="title" required minLength={2} defaultValue={course?.title} className="tf-input" placeholder={t("ex. Engleză B2 — grupa de seară")} />
      </Field>
      <Field label={t("Materie")} htmlFor="subject"><input id="subject" name="subject" defaultValue={course?.subject ?? ""} className="tf-input" placeholder={t("ex. Engleză")} /></Field>
      <Field label={t("Nivel")} htmlFor="level"><input id="level" name="level" defaultValue={course?.level ?? ""} className="tf-input" placeholder="ex. B2" /></Field>
      <Field label={t("Format")} htmlFor="format">
        <select id="format" name="format" className="tf-input" defaultValue={course?.format ?? "group"}>
          <option value="group">{t("Grupă")}</option>
          <option value="individual">{t("Individual")}</option>
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label={t("Preț / lecție")} htmlFor="price"><input id="price" name="price" inputMode="decimal" defaultValue={course?.price?.toString() ?? ""} className="tf-input" placeholder="0" /></Field>
        <Field label={t("Monedă")} htmlFor="currency">
          <select id="currency" name="currency" className="tf-input" defaultValue={course?.currency ?? defaultCurrency}>
            {["MDL", "EUR", "RON", "USD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {colors && (
        <fieldset className="sm:col-span-2">
          <legend className="tf-label">{t("Culoare")}</legend>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="cursor-pointer" title={t("Automat")}>
              <input type="radio" name="color" value="" defaultChecked={!course?.color} className="peer sr-only" />
              <span className="grid h-8 min-w-8 place-items-center rounded-full border-2 border-dashed border-line px-2.5 text-[10px] font-extrabold text-muted peer-checked:border-primary peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
                {autoColor && <span className="mr-1.5 inline-block h-3 w-3 rounded-full" style={{ background: autoColor }} />}{t("Automat")}
              </span>
            </label>
            {COURSE_PALETTE.map(c => (
              <label key={c} className="cursor-pointer" title={c}>
                <input type="radio" name="color" value={c} defaultChecked={course?.color === c} className="peer sr-only" />
                <span className="block h-8 w-8 rounded-full ring-offset-2 ring-offset-panel peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" style={{ background: c }} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label={t("Descriere")} htmlFor="description" wide><textarea id="description" name="description" rows={3} defaultValue={course?.description ?? ""} className="tf-input" /></Field>
    </ActionForm>
  );
}
