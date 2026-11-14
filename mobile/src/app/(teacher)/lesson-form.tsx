import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DayStrip, StudentPicker } from "@/components/pickers";
import { Button, Chip, ChipRow, ErrorNote, Field, Label, TopBar, styles as ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { S } from "@/lib/theme";
import { addDays, dateKey, formatTime, isDateKey, zonedToUtc } from "@/lib/time";

const DURATIONS = [30, 45, 60, 90, 120].map(v => ({ value: v, label: `${v} min` }));
const REPEATS = [1, 4, 8, 12].map(v => ({ value: v, label: v === 1 ? "O dată" : `${v} săptămâni` }));
const QUICK_TIMES = ["09:00", "10:00", "12:00", "14:00", "16:00", "17:00", "18:00", "19:00"];

export default function LessonForm() {
  const { id, date, student } = useLocalSearchParams<{ id?: string; date?: string; student?: string }>();
  const { data, reload } = useTeacher();
  const tz = data.timezone;
  const existing = id ? data.lessons.find(l => l.id === id) : undefined;
  const today = dateKey(new Date(), tz);

  const [studentId, setStudentId] = useState<string | null>(existing?.student_id ?? student ?? null);
  const [courseId, setCourseId] = useState<string | null>(existing?.course_id ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [day, setDay] = useState(existing ? dateKey(new Date(existing.starts_at), tz) : isDateKey(date) ? date : today);
  const [time, setTime] = useState(existing ? formatTime(existing.starts_at, tz) : "17:00");
  const [duration, setDuration] = useState(existing ? Math.round((new Date(existing.ends_at).getTime() - new Date(existing.starts_at).getTime()) / 60000) : 60);
  const [repeat, setRepeat] = useState(1);
  const [meetingUrl, setMeetingUrl] = useState(existing?.meeting_url ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeStudents = data.students.filter(s => s.status === "active" || s.id === studentId);
  const courses = data.courses.filter(c => c.is_active || c.id === courseId);

  async function save() {
    setError(null);
    if (!studentId && !courseId) return setError("Alege un elev sau un curs.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError("Scrie ora în formatul HH:MM, de exemplu 17:30.");
    const url = meetingUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) return setError("Linkul lecției trebuie să înceapă cu https://");
    const name = title.trim()
      || (courseId ? data.courses.find(c => c.id === courseId)?.title : undefined)
      || (studentId ? `Lecție · ${data.students.find(s => s.id === studentId)?.full_name ?? ""}` : "");
    if (!name) return setError("Adaugă un titlu lecției.");

    const [hh, mm] = time.split(":").map(Number);
    const rows = Array.from({ length: existing ? 1 : repeat }, (_, i) => {
      const [y, m, d] = addDays(day, i * 7).split("-").map(Number);
      const start = zonedToUtc(y, m, d, hh, mm, tz);
      return {
        title: name.slice(0, 160), course_id: courseId, student_id: studentId,
        meeting_url: url || null, description: description.trim() || null,
        starts_at: start.toISOString(), ends_at: new Date(start.getTime() + duration * 60000).toISOString()
      };
    });

    setBusy(true);
    const { error } = existing
      ? await supabase.from("lessons").update(rows[0]).eq("id", existing.id).eq("teacher_id", data.userId)
      : await supabase.from("lessons").insert(rows.map(r => ({ ...r, teacher_id: data.userId })));
    setBusy(false);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <TopBar title={existing ? "Editează lecția" : "Lecție nouă"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.screenContent} keyboardShouldPersistTaps="handled">
          <ErrorNote text={error} />
          <StudentPicker students={activeStudents} value={studentId} onChange={setStudentId} allowNone={courses.length > 0} />
          {courses.length ? (
            <View style={{ marginBottom: S.lg }}>
              <Label>Curs (opțional)</Label>
              <ChipRow options={[{ value: "", label: "Fără curs" }, ...courses.map(c => ({ value: c.id, label: c.title }))]}
                value={courseId ?? ""} onChange={v => setCourseId(v || null)} />
            </View>
          ) : null}
          <Field label="Titlu (opțional)" value={title} onChangeText={setTitle} placeholder="Se completează automat" maxLength={160} />
          <DayStrip value={day} onChange={setDay} today={today} />
          <Field label="Ora" value={time} onChangeText={setTime} placeholder="17:00" keyboardType="numbers-and-punctuation" maxLength={5} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: -S.sm, marginBottom: S.lg }}>
            {QUICK_TIMES.map(t => <Chip key={t} label={t} selected={t === time} onPress={() => setTime(t)} />)}
          </View>
          <View style={{ marginBottom: S.lg }}><Label>Durata</Label><ChipRow options={DURATIONS} value={duration} onChange={setDuration} /></View>
          {!existing ? <View style={{ marginBottom: S.lg }}><Label>Repetă săptămânal</Label><ChipRow options={REPEATS} value={repeat} onChange={setRepeat} /></View> : null}
          <Field label="Link lecție online (opțional)" value={meetingUrl} onChangeText={setMeetingUrl} placeholder="https://meet.google.com/…" autoCapitalize="none" keyboardType="url" />
          <Field label="Notițe" value={description} onChangeText={setDescription} multiline maxLength={2000} />
          <Button title={existing ? "Salvează" : repeat > 1 ? `Programează ${repeat} lecții` : "Programează lecția"} onPress={save} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
