"use client";

import { useActionState } from "react";
import { createCourse, type FormState } from "../../actions";

export function CourseForm({ demo, defaultCurrency }: { demo: boolean; defaultCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCourse, {});
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="tf-label" htmlFor="title">Nume curs / grupă</label>
        <input id="title" name="title" required minLength={2} className="tf-input" placeholder="ex. Engleză B2 — grupa de seară" />
      </div>
      <div>
        <label className="tf-label" htmlFor="subject">Materie</label>
        <input id="subject" name="subject" className="tf-input" placeholder="ex. Engleză" />
      </div>
      <div>
        <label className="tf-label" htmlFor="level">Nivel</label>
        <input id="level" name="level" className="tf-input" placeholder="ex. B2" />
      </div>
      <div>
        <label className="tf-label" htmlFor="format">Format</label>
        <select id="format" name="format" className="tf-input" defaultValue="group">
          <option value="group">Grupă</option>
          <option value="individual">Individual</option>
        </select>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <div>
          <label className="tf-label" htmlFor="price">Preț / lecție</label>
          <input id="price" name="price" inputMode="decimal" className="tf-input" placeholder="0" />
        </div>
        <div>
          <label className="tf-label" htmlFor="currency">Monedă</label>
          <select id="currency" name="currency" className="tf-input" defaultValue={defaultCurrency}>
            {["MDL", "EUR", "RON", "USD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="tf-label" htmlFor="description">Descriere</label>
        <textarea id="description" name="description" rows={3} className="tf-input" />
      </div>
      {state.error && <p role="alert" className="text-[12px] font-semibold text-[#c03a3a] sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button className="tf-btn" disabled={pending || demo}>{pending ? "Se creează…" : "Creează cursul"}</button>
        {demo && <span className="ml-3 text-[11px] text-muted">Indisponibil în modul demonstrativ.</span>}
      </div>
    </form>
  );
}
