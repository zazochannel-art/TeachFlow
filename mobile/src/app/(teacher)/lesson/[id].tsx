import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text, View } from "react-native";
import { LESSON_STATUS } from "@/components/lesson-row";
import { Badge, Button, Card, Chip, Empty, ErrorNote, IconButton, Label, Screen, Section, TopBar, confirm } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { dateKey, formatDayHeading, formatTime } from "@/lib/time";
import type { LessonStatus } from "@/lib/types";

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, reload } = useTeacher();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lesson = data.lessons.find(l => l.id === id);
  const tz = data.timezone;

  if (!lesson) return <Screen edges={["top"]}><TopBar title="Lecție" /><Empty text="Lecția nu mai există." /></Screen>;
  const student = lesson.student_id ? data.students.find(s => s.id === lesson.student_id) : undefined;
  const course = lesson.course_id ? data.courses.find(c => c.id === lesson.course_id) : undefined;
  const h = formatDayHeading(dateKey(new Date(lesson.starts_at), tz));
  const status = LESSON_STATUS[lesson.status];
  const homework = data.homework.filter(hw => hw.lesson_id === lesson.id);

  async function setStatus(next: LessonStatus) {
    setBusy(next); setError(null);
    const { error } = await supabase.from("lessons").update({ status: next }).eq("id", lesson!.id).eq("teacher_id", data.userId);
    setBusy(null);
    if (error) setError(error.message); else reload();
  }

  async function remove() {
    if (!(await confirm("Ștergi lecția?", "Lecția va fi ștearsă și din aplicația web."))) return;
    const { error } = await supabase.from("lessons").delete().eq("id", lesson!.id).eq("teacher_id", data.userId);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  return (
    <Screen edges={["top"]} padded={false} onRefresh={reload}>
      <TopBar title="Lecție" right={<IconButton icon="create-outline" label="Editează" onPress={() => router.push(`/lesson-form?id=${lesson.id}`)} />} />
      <View style={{ padding: S.lg }}>
        <ErrorNote text={error} />
        <Card style={{ gap: S.sm }}>
          <Badge label={status.label} tone={status.tone} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{lesson.title}</Text>
          <Text style={{ color: C.muted, fontSize: 15 }}>{h.weekday}, {h.rest} · {formatTime(lesson.starts_at, tz)}–{formatTime(lesson.ends_at, tz)}</Text>
          {student ? <Text onPress={() => router.push(`/student/${student.id}`)} style={{ color: C.primary, fontWeight: "700" }}>👤 {student.full_name}</Text> : null}
          {course ? <Text style={{ color: C.ink }}>📘 {course.title}</Text> : null}
          {lesson.description ? <Text style={{ color: C.ink, marginTop: S.sm }}>{lesson.description}</Text> : null}
        </Card>

        <View style={{ gap: S.sm, marginTop: S.lg }}>
          {lesson.meeting_url ? <Button title="Intră în lecția online" icon="videocam" onPress={() => WebBrowser.openBrowserAsync(lesson.meeting_url!)} /> : null}
          <Button title="Deschide clasa TeachFlow (web)" kind="secondary" icon="easel-outline" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/classroom`)} />
        </View>

        <View style={{ marginTop: S.xl }}>
          <Label>Marchează lecția</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {(Object.keys(LESSON_STATUS) as LessonStatus[]).map(s => (
              <Chip key={s} label={busy === s ? "…" : LESSON_STATUS[s].label} selected={lesson.status === s} onPress={() => setStatus(s)} />
            ))}
          </View>
        </View>

        <Section title="Teme din lecție" action={student ? { label: "+ Temă", onPress: () => router.push(`/homework-form?student=${student.id}&lesson=${lesson.id}`) } : undefined}>
          {homework.length ? homework.map(hw => (
            <Card key={hw.id} onPress={() => router.push(`/homework-form?id=${hw.id}`)} style={{ marginBottom: S.sm, flexDirection: "row", alignItems: "center", gap: S.md }}>
              <Ionicons name="document-text-outline" size={20} color={C.primary} />
              <Text style={{ flex: 1, fontWeight: "700", color: C.ink }}>{hw.title}</Text>
            </Card>
          )) : <Text style={{ color: C.muted }}>Nicio temă legată de această lecție.</Text>}
        </Section>

        <Button title="Șterge lecția" kind="danger" icon="trash-outline" onPress={remove} style={{ marginTop: S.xxl }} />
      </View>
    </Screen>
  );
}
