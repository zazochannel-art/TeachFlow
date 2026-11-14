"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/common";

interface Values {
  full_name: string; preferred_language: string; timezone: string;
  headline: string; bio: string; hourly_rate: string; currency: string;
}

export function SettingsForm({ values, demo }: { values: Values; demo: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSettings, {});
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="tf-label" htmlFor="full_name">Nume complet</label>
        <input id="full_name" name="full_name" defaultValue={values.full_name} className="tf-input" />
      </div>
      <div className="sm:col-span-2">
        <label className="tf-label" htmlFor="headline">Titlu profesional</label>
        <input id="headline" name="headline" defaultValue={values.headline} className="tf-input" placeholder="ex. Profesor de engleză, pregătire IELTS" />
      </div>
      <div className="sm:col-span-2">
        <label className="tf-label" htmlFor="bio">Despre tine</label>
        <textarea id="bio" name="bio" rows={3} defaultValue={values.bio} className="tf-input" />
      </div>
      <div>
        <label className="tf-label" htmlFor="preferred_language">Limba interfeței</label>
        <select id="preferred_language" name="preferred_language" defaultValue={values.preferred_language} className="tf-input">
          <option value="ro">Română</option><option value="ru">Русский</option><option value="en">English</option>
        </select>
      </div>
      <div>
        <label className="tf-label" htmlFor="timezone">Fus orar</label>
        <input id="timezone" name="timezone" defaultValue={values.timezone} className="tf-input" />
      </div>
      <div>
        <label className="tf-label" htmlFor="hourly_rate">Tarif orar</label>
        <input id="hourly_rate" name="hourly_rate" inputMode="decimal" defaultValue={values.hourly_rate} className="tf-input" />
      </div>
      <div>
        <label className="tf-label" htmlFor="currency">Monedă</label>
        <select id="currency" name="currency" defaultValue={values.currency} className="tf-input">
          {["MDL", "EUR", "RON", "USD"].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {state.error && <p role="alert" className="text-[12px] font-semibold text-[#c03a3a] sm:col-span-2">{state.error}</p>}
      {state.ok && <p role="status" className="text-[12px] font-semibold text-[#1b8a5a] sm:col-span-2">{state.ok}</p>}
      <div className="sm:col-span-2">
        <button className="tf-btn" disabled={pending || demo}>{pending ? "Se salvează…" : "Salvează"}</button>
        {demo && <span className="ml-3 text-[11px] text-muted">Indisponibil în modul demonstrativ.</span>}
      </div>
    </form>
  );
}
