import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";
import { LessonRow } from "@/components/lesson-row";
import { Button, Empty, PageTitle, Screen, Section } from "@/components/ui";
import { firstName } from "@/lib/derive";
import { useStudentData } from "@/lib/student-data";
import { C, S } from "@/lib/theme";
import { useNow, useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function StudentLessons() {
  const { data, reload } = useStudentData();
  useReloadOnFocus(reload);
  const now = useNow();
  if (!data) return null;
  const tz = data.timezone;
  const next = data.lessons.filter(l => new Date(l.ends_at).getTime() > now && l.status === "scheduled");
  const past = data.lessons.filter(l => new Date(l.ends_at).getTime() <= now || l.status !== "scheduled").slice(-10).reverse();
  const first = next[0];

  return (
    <Screen onRefresh={reload}>
      <PageTitle title={`Bună${data.fullName ? `, ${firstName(data.fullName)}` : ""}!`} subtitle="Lecțiile tale" />
      {first?.meeting_url ? (
        <View style={{ backgroundColor: C.navy, borderRadius: 20, padding: S.lg, gap: S.md, marginBottom: S.md }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Următoarea lecție: {first.title}</Text>
          <Button title="Intră în lecție" icon="videocam" onPress={() => WebBrowser.openBrowserAsync(first.meeting_url!)} />
        </View>
      ) : null}
      <Section title="Urmează">
        {next.length ? next.slice(0, 20).map(l => <LessonRow key={l.id} lesson={l} tz={tz} showDate />) : <Empty icon="calendar-clear-outline" text="Nicio lecție programată." />}
      </Section>
      {past.length ? <Section title="Recente">{past.map(l => <LessonRow key={l.id} lesson={l} tz={tz} showDate />)}</Section> : null}
    </Screen>
  );
}
