import { Mail, MessageCircle, Phone } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";

export default async function MessagesPage() {
  const ws = await loadWorkspace();
  const contacts = ws.students.filter(s => s.status === "active");

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <PageHeader title="Mesaje" subtitle="Conversații cu elevii și părinții" />
        <EmptyState icon={MessageCircle} title="Mesageria internă urmează"
          text="Conversațiile din aplicație nu sunt încă disponibile. Până atunci poți contacta elevii direct prin email sau telefon din lista de alături." />
      </div>
      <section>
        <SectionTitle>Contacte</SectionTitle>
        <Card className="tf-scroll max-h-[620px] overflow-y-auto p-2">
          {contacts.length === 0 && <p className="p-4 text-[12px] text-muted">Niciun elev activ.</p>}
          {contacts.map(s => (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-soft">
              <Avatar name={s.full_name} size={36} />
              <div className="min-w-0 flex-1 truncate text-[12px] font-extrabold">{s.full_name}</div>
              {s.email && <a href={`mailto:${s.email}`} aria-label={`Email ${s.full_name}`} className="grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2"><Mail className="h-3.5 w-3.5" /></a>}
              {s.phone && <a href={`tel:${s.phone}`} aria-label={`Telefon ${s.full_name}`} className="grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2"><Phone className="h-3.5 w-3.5" /></a>}
            </div>
          ))}
        </Card>
        {ws.mode === "demo" && <DemoNotice />}
      </section>
    </div>
  );
}
