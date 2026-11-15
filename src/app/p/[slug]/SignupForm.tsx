"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { publicSignup } from "@/lib/actions/public-page";
import type { FormState } from "@/lib/actions/common";
import { useT } from "@/lib/i18n/client";

/** Sign-up form of the public teacher page. */
export function SignupForm({ slug, courses, defaultCourse }: { slug: string; courses: Array<{ id: string; title: string }>; defaultCourse?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(publicSignup, {});
  const [forChild, setForChild] = useState(false);

  if (state.ok === "sent") {
    return (
      <div role="status" className="rounded-2xl bg-[#e7f6ee] p-5 text-center text-[#11603f]">
        <CheckCircle2 className="mx-auto h-8 w-8" />
        <p className="mt-2 text-[14px] font-extrabold">{t("Mulțumesc! Cererea a fost trimisă.")}</p>
        <p className="mt-1 text-[12px]">{t("Te contactez în curând pe email sau la telefon.")}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3.5">
      <input type="hidden" name="slug" value={slug} />
      {/* Honeypot for bots: hidden from people and from screen readers. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="flex rounded-full bg-soft p-0.5 text-[12px] font-bold" role="radiogroup" aria-label={t("Cine se înscrie?")}>
        <button type="button" role="radio" aria-checked={!forChild} onClick={() => setForChild(false)} className={`flex-1 cursor-pointer rounded-full px-3 py-2 ${!forChild ? "bg-white text-ink shadow-card" : "text-muted"}`}>{t("Pentru mine")}</button>
        <button type="button" role="radio" aria-checked={forChild} onClick={() => setForChild(true)} className={`flex-1 cursor-pointer rounded-full px-3 py-2 ${forChild ? "bg-white text-ink shadow-card" : "text-muted"}`}>{t("Pentru copilul meu")}</button>
      </div>
      <div>
        <label className="tf-label" htmlFor="su-name">{forChild ? t("Numele tău (părinte)") : t("Numele tău")}</label>
        <input id="su-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="tf-input" />
      </div>
      {forChild && (
        <div>
          <label className="tf-label" htmlFor="su-child">{t("Numele copilului")}</label>
          <input id="su-child" name="student_name" required maxLength={120} className="tf-input" />
        </div>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <label className="tf-label" htmlFor="su-phone">{t("Telefon")}</label>
          <input id="su-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" placeholder="+373 …" className="tf-input" />
        </div>
        <div>
          <label className="tf-label" htmlFor="su-email">{t("Email")}</label>
          <input id="su-email" name="email" type="email" maxLength={200} autoComplete="email" className="tf-input" />
        </div>
      </div>
      {courses.length > 0 && (
        <div>
          <label className="tf-label" htmlFor="su-course">{t("Cursul dorit")}</label>
          <select id="su-course" name="course_id" defaultValue={defaultCourse ?? ""} key={defaultCourse} className="tf-input">
            <option value="">{t("Nu știu încă")}</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="tf-label" htmlFor="su-msg">{t("Mesaj (opțional)")}</label>
        <textarea id="su-msg" name="message" rows={3} maxLength={1000} placeholder={t("ex. nivelul actual, obiectivul, orele potrivite")} className="tf-input" />
      </div>
      {state.error && <p role="alert" className="text-[12px] font-semibold text-[#c03a3a]">{t(state.error)}</p>}
      <button className="tf-btn w-full justify-center" disabled={pending}>{pending ? t("Se trimite…") : t("Trimite cererea")}</button>
      <p className="text-center text-[10px] text-muted">{t("Datele tale ajung doar la acest profesor.")}</p>
    </form>
  );
}
