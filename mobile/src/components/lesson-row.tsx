import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, R, S } from "@/lib/theme";
import { formatDate, formatTime } from "@/lib/time";
import type { Lesson, LessonStatus } from "@/lib/types";
import { Badge, type Tone } from "./ui";

export const LESSON_STATUS: Record<LessonStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Programată", tone: "primary" },
  completed: { label: "Efectuată", tone: "green" },
  cancelled: { label: "Anulată", tone: "muted" },
  no_show: { label: "Absent", tone: "red" }
};

export function LessonRow({ lesson, tz, who, showDate, href }: { lesson: Lesson; tz: string; who?: string; showDate?: boolean; href?: string }) {
  const s = LESSON_STATUS[lesson.status];
  const content = (
    <>
      <View style={styles.time}>
        <Text style={styles.timeText}>{formatTime(lesson.starts_at, tz)}</Text>
        <Text style={styles.timeSub}>{showDate ? formatDate(lesson.starts_at, tz) : formatTime(lesson.ends_at, tz)}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={styles.title}>{lesson.title}</Text>
        {who && !lesson.title.includes(who) ? <Text numberOfLines={1} style={styles.who}>{who}</Text> : null}
        {lesson.status !== "scheduled" ? <Badge label={s.label} tone={s.tone} /> : null}
      </View>
    </>
  );
  if (!href) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={() => router.push(href as never)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: S.md, alignItems: "center", backgroundColor: C.panel, borderRadius: R.lg, padding: S.md, marginBottom: S.sm },
  time: { width: 64, height: 56, borderRadius: R.md, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" },
  timeText: { fontSize: 16, fontWeight: "800", color: C.primary2 },
  timeSub: { fontSize: 11, color: C.muted, fontWeight: "700" },
  title: { fontSize: 15, fontWeight: "800", color: C.ink },
  who: { fontSize: 13, color: C.muted }
});
