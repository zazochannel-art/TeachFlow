import { Avatar, Card, DemoNotice, Field, SectionTitle } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { AvatarUpload } from "@/components/AvatarUpload";
import { loadParentPortal } from "@/lib/data/parent";
import { updateMyProfile } from "@/lib/actions/student";
import { getT } from "@/lib/i18n/server";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push/server";

/** Parent's own profile: photo, name and the children they follow. */
export default async function ParentProfile() {
  const [p, t] = await Promise.all([loadParentPortal(), getT()]);
  const demo = p.mode === "demo";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-4">
        {demo ? <Avatar name={p.name} src={p.avatarUrl} size={72} className="ring-4 ring-tint" /> : <AvatarUpload name={p.name} src={p.avatarUrl} size={72} />}
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-extrabold tracking-tight">{p.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{t("Profilul meu")}</p>
        </div>
      </div>

      <div className="mt-8"><SectionTitle>{t("Datele mele")}</SectionTitle></div>
      <Card className="p-5">
        <ActionForm action={updateMyProfile} demo={demo} className="grid gap-4">
          <Field label={t("Nume complet")} htmlFor="full_name" wide><input id="full_name" name="full_name" required minLength={2} maxLength={120} defaultValue={p.name} className="tf-input" /></Field>
          <p className="text-[11px] text-muted sm:col-span-2">{t("Profesorul vede numele și poza ta.")}</p>
        </ActionForm>
      </Card>

      <div className="mt-8"><SectionTitle>{t("Notificări pe telefon")}</SectionTitle></div>
      <Card className="p-5"><PushToggle publicKey={demo ? null : vapidPublicKey()} /></Card>

      <div className="mt-8"><SectionTitle>{t("Copiii mei")}</SectionTitle></div>
      <Card className="divide-y divide-line">
        {p.children.length === 0 && <p className="p-4 text-[12px] text-muted">{t("Contul tău nu este încă legat de niciun copil.")}</p>}
        {p.children.map(c => (
          <div key={c.studentId} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={c.name} src={c.avatarUrl} size={36} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold">{c.name}</p>
              <p className="truncate text-[11px] text-muted">{[c.gradeLevel, t("profesor: {name}", { name: c.teacherName })].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-[11px] text-muted">{t("Ca să adaugi alt copil, cere profesorului lui un link de invitație pentru părinte.")}</p>
      {demo && <DemoNotice />}
    </div>
  );
}
