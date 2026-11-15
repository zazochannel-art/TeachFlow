import Link from "next/link";
import { headers } from "next/headers";
import { ExternalLink, Globe, Inbox, Mail, Phone, X } from "lucide-react";
import { Card, DemoNotice, EmptyState, Field, PageHeader, Pill, SectionTitle, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { CopyLink } from "@/components/CopyLink";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadTeacherExtras } from "@/lib/data/teacher-extras";
import { loadSignupRequests } from "@/lib/data/public-page";
import { acceptSignup, declineSignup, deleteSignup, savePublicPage } from "@/lib/actions/public-page";
import { suggestSlug } from "@/lib/slug";
import { formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

type Params = { status?: string };

/** The teacher's public page settings and the sign-up requests it brings in (migration 0015). */
export default async function PublicPageSettings({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, t, extras, req, sp, h] = await Promise.all([loadWorkspace(), getT(), loadTeacherExtras(), loadSignupRequests(), searchParams, headers()]);
  const demo = ws.mode === "demo";
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "teachflow.app"}`;

  if (!demo && (!extras || !req.ready)) {
    return (
      <div>
        <PageHeader title={t("Pagina mea publică")} />
        <div className="rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">{t("Pagina publică nu este activată încă. Aplică supabase/migrations/0015_gamification_invoices_public_page.sql în Supabase SQL Editor.")}</div>
      </div>
    );
  }

  const slug = extras?.public_slug || (demo ? "demo" : suggestSlug(ws.profile?.full_name || ws.email?.split("@")[0] || ""));
  const url = `${origin}/p/${slug}`;
  const live = demo || Boolean(extras?.public_enabled && extras.public_slug);
  const courses = ws.courses.filter(c => c.is_active);
  const course = new Map(ws.courses.map(c => [c.id, c.title]));
  const filter = sp.status === "all" ? "all" : "new";
  const requests = req.requests.filter(r => filter === "all" || r.status === "new");
  const fresh = req.requests.filter(r => r.status === "new").length;

  return (
    <div>
      <PageHeader title={t("Pagina mea publică")} subtitle={t("O pagină cu tine și cursurile tale, cu formular de înscriere. Trimite linkul părinților sau pune-l pe Facebook și Instagram.")}
        action={live && <a href={demo ? "/p/demo" : `/p/${slug}`} target="_blank" rel="noopener noreferrer" className="tf-btn"><ExternalLink className="h-4 w-4" /> {t("Deschide pagina")}</a>} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0">
          <SectionTitle>{t("Cereri de înscriere")}</SectionTitle>
          <Tabs active={filter} items={[
            { key: "new", label: t("Noi"), href: "/public-page", count: fresh },
            { key: "all", label: t("Toate"), href: "/public-page?status=all", count: req.requests.length }
          ]} />
          {requests.length === 0 ? (
            <EmptyState icon={Inbox} title={t("Nicio cerere nouă")} text={live ? t("Când cineva completează formularul de pe pagina ta, cererea apare aici și primești o notificare.") : t("Activează pagina și trimite linkul. Cererile vor apărea aici.")} />
          ) : (
            <div className="space-y-3">
              {requests.map(r => (
                <Card key={r.id} className="p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-extrabold">{r.student_name ? t("{child} (părinte: {parent})", { child: r.student_name, parent: r.name }) : r.name}</p>
                      <p className="text-[11px] text-muted">{[r.course_id ? course.get(r.course_id) ?? t("curs șters") : t("fără curs ales"), `${formatDate(r.created_at, ws.timezone, t.locale)}, ${formatTime(r.created_at, ws.timezone, t.locale)}`].join(" · ")}</p>
                    </div>
                    <Pill tone={r.status === "new" ? "blue" : r.status === "accepted" ? "green" : "gray"}>{r.status === "new" ? t("Nouă") : r.status === "accepted" ? t("Adăugat ca elev") : t("Respinsă")}</Pill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                    {r.phone && <a href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 font-bold text-primary"><Phone className="h-3.5 w-3.5" />{r.phone}</a>}
                    {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 font-bold text-primary"><Mail className="h-3.5 w-3.5" />{r.email}</a>}
                  </div>
                  {r.message && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-soft px-3 py-2 text-[12px]">{r.message}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {r.status !== "accepted" && (
                      <ActionForm action={acceptSignup} demo={demo} submitLabel={t("Adaugă ca elev")} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                      </ActionForm>
                    )}
                    {r.status === "accepted" && r.student_id && <Link href={`/students?edit=${r.student_id}`} className="tf-btn-ghost py-2 text-[12px]">{t("Deschide fișa elevului")}</Link>}
                    {r.status === "new" && <form action={declineSignup}><input type="hidden" name="id" value={r.id} /><SubmitButton className="tf-btn-ghost py-2 text-[12px]"><X className="h-3.5 w-3.5" /> {t("Respinge")}</SubmitButton></form>}
                    {r.status !== "new" && <form action={deleteSignup}><input type="hidden" name="id" value={r.id} /><ConfirmSubmit label={t("Șterge")} /></form>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>{t("Setările paginii")}</SectionTitle>
          <Card className="p-6">
            {live && (
              <div className="mb-5 rounded-2xl bg-tint p-4">
                <p className="mb-2 flex items-center gap-2 text-[12px] font-extrabold text-primary-2"><Globe className="h-4 w-4" /> {t("Pagina ta este publică")}</p>
                <CopyLink url={demo ? `${origin}/p/demo` : url} />
              </div>
            )}
            <ActionForm action={savePublicPage} demo={demo} className="grid gap-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-soft p-4">
                <input type="checkbox" name="public_enabled" defaultChecked={demo || extras?.public_enabled} className="mt-0.5 h-4 w-4 accent-[#5269e8]" />
                <span>
                  <span className="block text-[13px] font-bold text-ink">{t("Pagina este publică")}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{t("Oricine are linkul o poate vedea. Debifează ca s-o ascunzi.")}</span>
                </span>
              </label>
              <Field label={t("Adresa paginii")} htmlFor="public_slug">
                <div className="flex items-center gap-1 rounded-[12px] border border-line bg-white pl-3 text-[13px] focus-within:border-primary">
                  <span className="shrink-0 text-muted">/p/</span>
                  <input id="public_slug" name="public_slug" required minLength={3} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={slug} className="min-w-0 flex-1 bg-transparent py-[11px] pr-3 outline-none" />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Oraș (opțional)")} htmlFor="public_city"><input id="public_city" name="public_city" maxLength={80} defaultValue={extras?.public_city ?? ""} placeholder={t("ex. Chișinău sau online")} className="tf-input" /></Field>
                <Field label={t("Telefon afișat (opțional)")} htmlFor="public_phone"><input id="public_phone" name="public_phone" maxLength={40} defaultValue={extras?.public_phone ?? ""} placeholder="+373 …" className="tf-input" /></Field>
              </div>
              <label className="flex cursor-pointer items-center gap-3 text-[13px]">
                <input type="checkbox" name="public_prices" defaultChecked={demo || (extras?.public_prices ?? true)} className="h-4 w-4 accent-[#5269e8]" /> {t("Arată prețurile cursurilor")}
              </label>
              {courses.length > 0 && (
                <fieldset className="rounded-[16px] border border-line p-4">
                  <legend className="px-1 text-[12px] font-extrabold">{t("Cursuri afișate pe pagină")}</legend>
                  <div className="grid gap-2">
                    {courses.map(c => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-3 text-[13px]">
                        <input type="hidden" name="course_all" value={c.id} />
                        <input type="checkbox" name="course" value={c.id} defaultChecked={demo || req.publicCourses.has(c.id)} className="h-4 w-4 accent-[#5269e8]" /> {c.title}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="text-[11px] text-muted">{t("Numele, poza, titlul profesional, descrierea și tariful vin din Setări.")} <Link href="/settings" className="font-bold text-primary">{t("Setări")} →</Link></p>
            </ActionForm>
          </Card>
        </section>
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
