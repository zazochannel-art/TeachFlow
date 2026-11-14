import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LessonRow } from "@/components/lesson-row";
import { Empty, IconButton, PageTitle, Screen, Section } from "@/components/ui";
import { lessonsOnDay, studentMap } from "@/lib/derive";
import { useTeacher } from "@/lib/teacher-data";
import { C, R, S } from "@/lib/theme";
import { addDays, dateKey, formatDayHeading, formatShortDay, startOfWeek } from "@/lib/time";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function Calendar() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const tz = data.timezone;
  const today = dateKey(new Date(), tz);
  const [selected, setSelected] = useState(today);
  const monday = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const students = studentMap(data.students);
  const lessons = lessonsOnDay(data.lessons, selected, tz);
  const heading = formatDayHeading(selected);

  return (
    <Screen onRefresh={reload}>
      <PageTitle title="Calendar" subtitle={`${heading.weekday}, ${heading.rest}`}
        right={<IconButton icon="add" filled label="Lecție nouă" onPress={() => router.push(`/lesson-form?date=${selected}`)} />} />

      <View style={styles.weekNav}>
        <Pressable hitSlop={10} onPress={() => setSelected(addDays(selected, -7))}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
        <Pressable onPress={() => setSelected(today)}><Text style={styles.today}>Azi</Text></Pressable>
        <Pressable hitSlop={10} onPress={() => setSelected(addDays(selected, 7))}><Ionicons name="chevron-forward" size={22} color={C.ink} /></Pressable>
      </View>

      <View style={styles.week}>
        {days.map(d => {
          const f = formatShortDay(d);
          const active = d === selected;
          const count = lessonsOnDay(data.lessons, d, tz).filter(l => l.status !== "cancelled").length;
          return (
            <Pressable key={d} onPress={() => setSelected(d)} style={[styles.day, active && styles.dayActive]}>
              <Text style={[styles.dayName, active && { color: "#fff" }]}>{f.weekday}</Text>
              <Text style={[styles.dayNum, active && { color: "#fff" }, d === today && !active && { color: C.primary }]}>{f.day}</Text>
              <View style={[styles.dot, { opacity: count ? 1 : 0 }, active && { backgroundColor: "#fff" }]} />
            </Pressable>
          );
        })}
      </View>

      <Section title={lessons.length ? `${lessons.length} ${lessons.length === 1 ? "lecție" : "lecții"}` : "Lecții"}>
        {lessons.length
          ? lessons.map(l => <LessonRow key={l.id} lesson={l} tz={tz} who={l.student_id ? students[l.student_id]?.full_name : undefined} href={`/lesson/${l.id}`} />)
          : <Empty icon="calendar-clear-outline" text="Nicio lecție în această zi." action={{ label: "Adaugă lecție", onPress: () => router.push(`/lesson-form?date=${selected}`) }} />}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.md },
  today: { color: C.primary, fontWeight: "800", fontSize: 15 },
  week: { flexDirection: "row", gap: 6 },
  day: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: R.md, backgroundColor: C.panel, gap: 2 },
  dayActive: { backgroundColor: C.primary },
  dayName: { fontSize: 11, fontWeight: "700", color: C.muted },
  dayNum: { fontSize: 17, fontWeight: "800", color: C.ink },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.primary, marginTop: 2 }
});
