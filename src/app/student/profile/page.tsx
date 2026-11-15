import { BookOpen, CalendarCheck, ClipboardCheck, Star, UserX } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyNote, Field, Pill, SectionTitle } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { AvatarUpload } from "@/components/AvatarUpload";
import { loadStudentPortal } from "@/lib/data/student";
import { updateMyProfile } from "@/lib/actions/student";
import { colorOf } from "@/lib/data/derive";
import { formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push/server";

/** "Profilul meu": photo, name and phone, teachers and courses, and the student's own numbers. */
export default async function StudentProfile() {
  const [p, t] = await Promise.all([loadStudentPortal(), getT()]);
  const now = new Date();
  const demo = p.mode === "demo";
  const past = p.lessons.filter(l => new Date(l.ends_at) <= now && l.status !== "cancelled");
  const held = past.filter(l => l.status === "completed").length;
  const missed = past.filter(l => l.status === "no_show").length;
  const handedIn = p.homework.filter(h => h.status !== "assigned").length;
  const graded = p.homework.filter(h => h.status === "reviewed" && h.grade).slice(0, 8);
  const course = new Map(p.courses.map(c => [c.id, c]));
  const phone = p.links.find(l => l.phone)?.phone ?? "";
  const stat = "rounded-2xl bg-soft px-4 py-3";

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="flex items-center gap-4">
          {p.mode === "live" && p.visualReady
            ? <AvatarUpload name={p.name} src={p.avatarUrl} size={72} />
            : <Avatar name={p.name} src={p.avatarUrl} size={72} className="ring-4 ring-tint" />}
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-extrabold tracking-tight">{p.name}</h1>
            <p className="mt-0.5 text-[13px] text-muted">{t("Profilul meu")}</p>
          </div>
        </div>

        <div className="mt-8"><SectionTitle>{t("Ultimele 30 de zile")}</SectionTitle></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={stat}><CalendarCheck className="mb-1 h-4 w-4 text-primary-2" /><p className="text-[11px] text-muted">{t("Lecții făcute")}</p><p className="text-[18px] font-extrabold">{held}</p></div>
          <div className={stat}><UserX className="mb-1 h-4 w-4 text-[#c03a3a]" /><p className="text-[11px] text-muted">{t("Absențe")}</p><p className="text-[18px] font-extrabold">{missed}</p></div>
          <div className={stat}><ClipboardCheck className="mb-1 h-4 w-4 text-[#1b8a5a]" /><p className="text-[11px] text-muted">{t("Teme predate")}</p><p className="text-[18px] font-extrabold">{handedIn}<span className="text-[12px] font-bold text-muted"> / {p.homework.length}</span></p></div>
          <div className={stat}><Star className="mb-1 h-4 w-4 text-[#a2660a]" /><p className="text-[11px] text-muted">{t("Note primite")}</p><p className="text-[18px] font-extrabold">{graded.length}</p></div>
        </div>

        <div className="mt-8"><SectionTitle>{t("Note recente")}</SectionTitle></div>
        {graded.length === 0 ? <EmptyNote>{t("Nicio notă încă.")}</EmptyNote> : (
          <Card className="divide-y divide-line">
            {graded.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3 text-[12px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink">{h.title}</p>
                  <p className="truncate text-[11px] text-muted">{[h.course_id ? course.get(h.course_id)?.title : null, h.feedback].filter(Boolean).join(" · ") || formatDate(h.created_at, p.timezone, t.locale)}</p>
                </div>
                <Pill tone="green">{h.grade}</Pill>
              </div>
            ))}
          </Card>
        )}
      </div>

      <aside className="min-w-0">
        <SectionTitle>{t("Datele mele")}</SectionTitle>
        <Card className="p-5">
          <ActionForm action={updateMyProfile} demo={demo} className="grid gap-4">
            <Field label={t("Nume complet")} htmlFor="full_name" wide><input id="full_name" name="full_name" required minLength={2} maxLength={120} defaultValue={p.name} className="tf-input" /></Field>
            {p.links.length > 0 && (
              <Field label={t("Telefon")} htmlFor="phone" wide><input id="phone" name="phone" type="tel" maxLength={40} defaultValue={phone} className="tf-input" /></Field>
            )}
            <p className="text-[11px] text-muted sm:col-span-2">{t("Profesorii tăi văd numele, poza și telefonul.")}</p>
          </ActionForm>
        </Card>

        <div className="mt-8"><SectionTitle>{t("Notificări pe telefon")}</SectionTitle></div>
        <Card className="p-5"><PushToggle publicKey={p.mode === "live" ? vapidPublicKey() : null} /></Card>

        <div className="mt-8"><SectionTitle>{t("Profesorii mei")}</SectionTitle></div>
        <Card className="divide-y divide-line">
          {p.links.length === 0 && <p className="p-4 text-[12px] text-muted">{t("Contul tău nu este încă legat de un profesor.")}</p>}
          {p.links.map(l => <p key={l.studentId} className="px-4 py-3 text-[13px] font-extrabold">{l.teacherName}</p>)}
        </Card>

        <div className="mt-8"><SectionTitle>{t("Cursurile mele")}</SectionTitle></div>
        <div className="flex flex-wrap gap-2">
          {p.courses.length === 0 && <EmptyNote>{t("Niciun curs")}</EmptyNote>}
          {p.courses.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-xl bg-soft px-3 py-2 text-[12px] font-bold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(p, c.id) }} /><BookOpen className="h-3.5 w-3.5 text-muted" />{c.title}
            </span>
          ))}
        </div>
      </aside>
      {demo && <DemoNotice />}
    </div>
  );
}
