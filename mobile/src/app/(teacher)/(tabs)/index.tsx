import { router } from "expo-router";
import { Text, View } from "react-native";
import { LessonRow } from "@/components/lesson-row";
import { Empty, IconButton, PageTitle, Screen, Section, Stat } from "@/components/ui";
import { firstName, lessonsOnDay, lessonsThisWeek, studentMap, upcoming } from "@/lib/derive";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { dateKey, formatDayHeading, formatMoney } from "@/lib/time";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function Dashboard() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const tz = data.timezone;
  const today = dateKey(new Date(), tz);
  const heading = formatDayHeading(today);
  const students = studentMap(data.students);
  const todays = lessonsOnDay(data.lessons, today, tz).filter(l => l.status !== "cancelled");
  const next = upcoming(data.lessons, 5).filter(l => !todays.includes(l));
  const active = data.students.filter(s => s.status === "active").length;
  const pending = data.payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const toReview = data.homework.filter(h => h.status === "submitted").length;
  const unread = data.messages.filter(m => m.direction === "incoming" && !m.read_at).length;
  const who = (id: string | null) => (id ? students[id]?.full_name : undefined);

  return (
    <Screen onRefresh={reload}>
      <PageTitle
        title={`Bună${data.fullName ? `, ${firstName(data.fullName)}` : ""}!`}
        subtitle={`${heading.weekday}, ${heading.rest}`}
        right={<IconButton icon="add" filled label="Lecție nouă" onPress={() => router.push("/lesson-form")} />}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.md }}>
        <Stat icon="people" label="Elevi activi" value={String(active)} onPress={() => router.push("/students")} />
        <Stat icon="calendar" label="Lecții săptămâna asta" value={String(lessonsThisWeek(data.lessons, tz).length)} onPress={() => router.push("/calendar")} />
        <Stat icon="wallet" tone="amber" label="De încasat" value={formatMoney(pending, data.currency)} onPress={() => router.push("/payments")} />
        <Stat icon="document-text" tone={toReview ? "red" : "green"} label="Teme de verificat" value={String(toReview)} onPress={() => router.push("/homework")} />
      </View>

      {unread > 0 ? (
        <View style={{ marginTop: S.lg, backgroundColor: C.navy, borderRadius: 18, padding: S.lg }}>
          <Text onPress={() => router.push("/messages")} style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            Ai {unread} {unread === 1 ? "mesaj necitit" : "mesaje necitite"} de la elevi →
          </Text>
        </View>
      ) : null}

      <Section title="Azi" action={{ label: "Calendar", onPress: () => router.push("/calendar") }}>
        {todays.length ? todays.map(l => <LessonRow key={l.id} lesson={l} tz={tz} who={who(l.student_id)} href={`/lesson/${l.id}`} />)
          : <Empty icon="sunny-outline" text="Nicio lecție azi." action={{ label: "Programează o lecție", onPress: () => router.push("/lesson-form") }} />}
      </Section>

      {next.length ? (
        <Section title="Urmează">
          {next.map(l => <LessonRow key={l.id} lesson={l} tz={tz} who={who(l.student_id)} showDate href={`/lesson/${l.id}`} />)}
        </Section>
      ) : null}
    </Screen>
  );
}
