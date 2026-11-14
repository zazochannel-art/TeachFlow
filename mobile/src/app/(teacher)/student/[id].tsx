import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking, Text, View } from "react-native";
import { LessonRow } from "@/components/lesson-row";
import { Avatar, Badge, Button, Card, Empty, IconButton, Screen, Section, TopBar } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { formatDate, formatMoney } from "@/lib/time";
import { HOMEWORK_STATUS } from "@/components/homework-status";
import { useNow } from "@/lib/use-auto-refresh";

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, reload } = useTeacher();
  const s = data.students.find(x => x.id === id);
  const now = useNow();
  if (!s) return <Screen edges={["top"]}><TopBar title="Elev" /><Empty text="Elevul nu mai există." /></Screen>;
  const tz = data.timezone;
  const lessons = data.lessons.filter(l => l.student_id === s.id);
  const next = lessons.filter(l => new Date(l.ends_at).getTime() > now && l.status === "scheduled").slice(0, 5);
  const done = lessons.filter(l => l.status === "completed").length;
  const homework = data.homework.filter(h => h.student_id === s.id).slice(0, 5);
  const payments = data.payments.filter(p => p.student_id === s.id);
  const pending = payments.filter(p => p.status === "pending").reduce((a, p) => a + p.amount, 0);
  const paid = payments.filter(p => p.status === "paid").reduce((a, p) => a + p.amount, 0);

  return (
    <Screen edges={["top"]} padded={false} onRefresh={reload}>
      <TopBar title="Elev" right={<IconButton icon="create-outline" label="Editează" onPress={() => router.push(`/student-form?id=${s.id}`)} />} />
      <View style={{ padding: S.lg }}>
        <Card style={{ alignItems: "center", gap: S.sm }}>
          <Avatar name={s.full_name} size={72} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{s.full_name}</Text>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            {s.status === "inactive" ? <Badge label="Inactiv" tone="muted" /> : <Badge label="Activ" tone="green" />}
            {s.user_id ? <Badge label="Are cont în portal" /> : null}
          </View>
          {s.email ? <Text onPress={() => Linking.openURL(`mailto:${s.email}`)} style={{ color: C.primary, fontWeight: "700" }}>{s.email}</Text> : null}
          {s.phone ? <Text onPress={() => Linking.openURL(`tel:${s.phone}`)} style={{ color: C.primary, fontWeight: "700" }}>{s.phone}</Text> : null}
          {s.notes ? <Text style={{ color: C.muted, textAlign: "center" }}>{s.notes}</Text> : null}
        </Card>

        <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
          <Button title="Mesaj" icon="chatbubble-outline" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/chat/${s.id}`)} />
          <Button title="Lecție" icon="add" style={{ flex: 1 }} onPress={() => router.push(`/lesson-form?student=${s.id}`)} />
        </View>
        {!s.user_id ? (
          <Button title="Invită în portalul elevilor (web)" kind="ghost" icon="mail-outline" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/students?edit=${s.id}`)} />
        ) : null}

        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.lg }}>
          <Card style={{ flex: 1 }}><Text style={{ color: C.muted }}>Lecții efectuate</Text><Text style={{ fontSize: 20, fontWeight: "800", color: C.ink }}>{done}</Text></Card>
          <Card style={{ flex: 1 }}><Text style={{ color: C.muted }}>Achitat / datorie</Text><Text style={{ fontSize: 16, fontWeight: "800", color: C.ink }}>{formatMoney(paid, data.currency)}</Text><Text style={{ color: pending ? C.amber : C.muted, fontWeight: "700" }}>{formatMoney(pending, data.currency)}</Text></Card>
        </View>

        <Section title="Lecții următoare">
          {next.length ? next.map(l => <LessonRow key={l.id} lesson={l} tz={tz} showDate href={`/lesson/${l.id}`} />) : <Text style={{ color: C.muted }}>Nicio lecție programată.</Text>}
        </Section>

        <Section title="Teme" action={{ label: "+ Temă", onPress: () => router.push(`/homework-form?student=${s.id}`) }}>
          {homework.length ? homework.map(h => {
            const st = HOMEWORK_STATUS[h.status];
            return (
              <Card key={h.id} onPress={() => router.push(`/homework-form?id=${h.id}`)} style={{ marginBottom: S.sm, gap: 4 }}>
                <Text style={{ fontWeight: "800", color: C.ink }}>{h.title}</Text>
                <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
                  <Badge label={st.label} tone={st.tone} />
                  {h.due_at ? <Text style={{ color: C.muted, fontSize: 13 }}>termen {formatDate(h.due_at, tz)}</Text> : null}
                </View>
              </Card>
            );
          }) : <Text style={{ color: C.muted }}>Nicio temă.</Text>}
        </Section>

        <Section title="Plăți" action={{ label: "+ Plată", onPress: () => router.push(`/payment-form?student=${s.id}`) }}>
          {payments.length ? payments.slice(0, 5).map(p => (
            <Card key={p.id} onPress={() => router.push(`/payment-form?id=${p.id}`)} style={{ marginBottom: S.sm, flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontWeight: "800", color: C.ink }}>{formatMoney(p.amount, p.currency)}</Text>
              <Badge label={p.status === "paid" ? "Achitat" : "De încasat"} tone={p.status === "paid" ? "green" : "amber"} />
            </Card>
          )) : <Text style={{ color: C.muted }}>Nicio plată înregistrată.</Text>}
        </Section>
      </View>
    </Screen>
  );
}
