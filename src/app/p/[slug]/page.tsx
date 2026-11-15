import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, GraduationCap, MapPin, Phone, Users } from "lucide-react";
import { Avatar, Card, SubjectIcon } from "@/components/ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { loadPublicPage } from "@/lib/data/public-page";
import { subjectKind } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import { formatMoney } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { SignupForm } from "./SignupForm";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ curs?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  const page = await loadPublicPage(slug);
  if (!page) return { title: t("Pagina nu a fost găsită · TeachFlow") };
  const title = `${page.name}${page.headline ? ` · ${page.headline}` : ""}`;
  const description = (page.bio || page.headline || t("Cursuri cu {name}. Înscrie-te online.", { name: page.name })).slice(0, 160);
  return { title, description, openGraph: { title, description, type: "profile", ...(page.avatar_url ? { images: [page.avatar_url] } : {}) } };
}

/** Public teacher page: who they are, what they teach, and a sign-up form (no account needed). */
export default async function PublicTeacherPage({ params, searchParams }: Props) {
  const [{ slug }, sp, t] = await Promise.all([params, searchParams, getT()]);
  const page = await loadPublicPage(slug);
  if (!page) notFound();
  const first = page.name.split(" ")[0] || page.name;
  const money = (n: number, c: string) => formatMoney(n, c, t.locale);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-extrabold"><GraduationCap className="h-6 w-6 text-primary" fill="rgba(82,105,232,.3)" strokeWidth={1.8} /> TeachFlow</Link>
          <LanguageSwitcher dark />
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 md:flex-row md:items-center md:px-8 md:pb-14 md:pt-8">
          <Avatar name={page.name} src={page.avatar_url} size={112} className="ring-4 ring-white/15" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-[34px]">{page.name}</h1>
            {page.headline && <p className="mt-1.5 max-w-2xl text-[15px] text-white/85">{page.headline}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-bold">
              {page.city && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><MapPin className="h-3.5 w-3.5" />{page.city}</span>}
              {page.lessons_done >= 10 && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarCheck className="h-3.5 w-3.5" />{t.n("{n} lecție ținută|{n} lecții ținute|{n} de lecții ținute", page.lessons_done)}</span>}
              {page.students >= 3 && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Users className="h-3.5 w-3.5" />{t.n("{n} elev activ|{n} elevi activi|{n} de elevi activi", page.students)}</span>}
              {page.prices && page.hourly_rate != null && <span className="rounded-full bg-primary px-3 py-1.5">{t("de la {price} / oră", { price: money(page.hourly_rate, page.currency) })}</span>}
            </div>
          </div>
          <a href="#inscriere" className="tf-btn w-full justify-center md:w-auto">{t("Înscrie-te la curs")}</a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          {(page.bio || page.specialties.length > 0) && (
            <section>
              <h2 className="mb-3 text-[17px] font-extrabold">{t("Despre mine")}</h2>
              <Card className="p-6">
                {page.bio && <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{page.bio}</p>}
                {page.specialties.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{page.specialties.map(s => <span key={s} className="rounded-full bg-tint px-3 py-1 text-[12px] font-bold text-primary-2">{s}</span>)}</div>}
              </Card>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[17px] font-extrabold">{t("Cursuri")}</h2>
            {page.courses.length === 0 ? (
              <Card className="p-6 text-[13px] text-muted">{t("Scrie-mi în formular ce vrei să înveți și îți propun un program.")}</Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {page.courses.map(c => (
                  <Card key={c.id} className="flex flex-col p-5">
                    <div className="flex items-start gap-3" style={colorVar(c.color)}>
                      <span className="tf-c-soft tf-c-ink grid h-11 w-11 shrink-0 place-items-center rounded-full"><SubjectIcon kind={subjectKind(c.subject, c.title)} className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold leading-snug">{c.title}</h3>
                        <p className="text-[11px] text-muted">{[c.level, c.format === "group" ? t("în grup") : t("individual")].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    {c.description && <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-ink">{c.description}</p>}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                      <span className="text-[14px] font-extrabold">{page.prices && c.price != null ? t("{price} / lecție", { price: money(c.price, c.currency) }) : ""}</span>
                      <Link href={`/p/${page.slug}?curs=${c.id}#inscriere`} scroll={false} className="tf-btn-ghost px-3 py-2 text-[12px]">{t("Mă înscriu")}</Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside id="inscriere" className="scroll-mt-6">
          <Card className="p-6 lg:sticky lg:top-6">
            <h2 className="text-[17px] font-extrabold">{t("Înscrie-te la {name}", { name: first })}</h2>
            <p className="mb-5 mt-1 text-[12px] text-muted">{t("Lasă datele tale și te contactez pentru o primă lecție.")}</p>
            <SignupForm slug={page.slug} courses={page.courses.map(c => ({ id: c.id, title: c.title }))} defaultCourse={page.courses.some(c => c.id === sp.curs) ? sp.curs : undefined} />
            {page.phone && <a href={`tel:${page.phone.replace(/[^0-9+]/g, "")}`} className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-[13px] font-bold text-primary"><Phone className="h-4 w-4" />{page.phone}</a>}
          </Card>
        </aside>
      </main>

      <footer className="pb-10 text-center text-[11px] text-muted">
        <Link href="/register" className="hover:text-primary">{t("Pagină creată cu TeachFlow · Ești profesor? Creează-ți și tu una.")}</Link>
      </footer>
    </div>
  );
}
