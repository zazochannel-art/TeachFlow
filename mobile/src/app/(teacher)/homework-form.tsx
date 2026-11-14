import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HOMEWORK_STATUS } from "@/components/homework-status";
import { DayStrip, StudentPicker } from "@/components/pickers";
import { Button, Card, ChipRow, ErrorNote, Field, Label, TopBar, confirm, styles as ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { addDays, dateKey, formatDate, formatTime, zonedToUtc } from "@/lib/time";
import type { HomeworkStatus } from "@/lib/types";

export default function HomeworkForm() {
  const { id, student, lesson } = useLocalSearchParams<{ id?: string; student?: string; lesson?: string }>();
  const { data, reload } = useTeacher();
  const tz = data.timezone;
  const today = dateKey(new Date(), tz);
  const existing = id ? data.homework.find(h => h.id === id) : undefined;

  const [studentId, setStudentId] = useState<string | null>(existing?.student_id ?? student ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [hasDue, setHasDue] = useState(existing ? !!existing.due_at : true);
  const [due, setDue] = useState(existing?.due_at ? dateKey(new Date(existing.due_at), tz) : addDays(today, 7));
  const [status, setStatus] = useState<HomeworkStatus>(existing?.status ?? "assigned");
  const [grade, setGrade] = useState(existing?.grade ?? "");
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const studentName = existing ? data.students.find(s => s.id === existing.student_id)?.full_name : undefined;

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Adaugă un titlu.");
    if (!existing && !studentId) return setError("Alege elevul.");
    let due_at: string | null = null;
    if (hasDue) { const [y, m, d] = due.split("-").map(Number); due_at = zonedToUtc(y, m, d, 23, 59, tz).toISOString(); }
    const fields = { title: title.trim().slice(0, 160), description: description.trim() || null, due_at };
    setBusy(true);
    const { error } = existing
      ? await supabase.from("homework").update({
          ...fields, status, grade: grade.trim() || null, feedback: feedback.trim() || null,
          ...(status === "submitted" && !existing.submitted_at ? { submitted_at: new Date().toISOString() } : {})
        }).eq("id", existing.id).eq("teacher_id", data.userId)
      : await supabase.from("homework").insert({ ...fields, student_id: studentId, lesson_id: lesson ?? null, teacher_id: data.userId });
    setBusy(false);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  async function remove() {
    if (!existing || !(await confirm("Ștergi tema?", "Tema va dispărea și pentru elev."))) return;
    const { error } = await supabase.from("homework").delete().eq("id", existing.id).eq("teacher_id", data.userId);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <TopBar title={existing ? "Temă" : "Temă nouă"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.screenContent} keyboardShouldPersistTaps="handled">
          <ErrorNote text={error} />
          {existing ? (
            <Text style={{ color: C.muted, marginBottom: S.lg }}>Elev: <Text style={{ color: C.ink, fontWeight: "800" }}>{studentName}</Text></Text>
          ) : (
            <StudentPicker students={data.students.filter(s => s.status === "active")} value={studentId} onChange={setStudentId} />
          )}
          {existing?.submission ? (
            <Card style={{ marginBottom: S.lg, gap: 6, borderWidth: 1, borderColor: C.amber }}>
              <Text style={{ fontWeight: "800", color: C.ink }}>Răspunsul elevului</Text>
              {existing.submitted_at ? <Text style={{ color: C.muted, fontSize: 12 }}>Predat {formatDate(existing.submitted_at, tz)}, {formatTime(existing.submitted_at, tz)}</Text> : null}
              <Text style={{ color: C.ink }}>{existing.submission}</Text>
            </Card>
          ) : null}
          <Field label="Titlu" value={title} onChangeText={setTitle} placeholder="Exercițiile 1–5, pagina 34" maxLength={160} />
          <Field label="Descriere" value={description} onChangeText={setDescription} multiline maxLength={4000} />
          <View style={{ marginBottom: S.lg }}>
            <Label>Termen</Label>
            <ChipRow options={[{ value: "yes", label: "Cu termen" }, { value: "no", label: "Fără termen" }]} value={hasDue ? "yes" : "no"} onChange={v => setHasDue(v === "yes")} />
          </View>
          {hasDue ? <DayStrip value={due} onChange={setDue} today={today} /> : null}
          {existing ? (
            <>
              <View style={{ marginBottom: S.lg }}>
                <Label>Stare</Label>
                <ChipRow options={(Object.keys(HOMEWORK_STATUS) as HomeworkStatus[]).map(s => ({ value: s, label: HOMEWORK_STATUS[s].label }))} value={status} onChange={setStatus} />
              </View>
              <Field label="Notă" value={grade} onChangeText={setGrade} placeholder="ex. 10 sau A" maxLength={20} />
              <Field label="Feedback pentru elev" value={feedback} onChangeText={setFeedback} multiline maxLength={4000} />
            </>
          ) : null}
          <Button title={existing ? "Salvează" : "Atribuie tema"} onPress={save} loading={busy} />
          {existing && status !== "reviewed" && existing.status === "submitted" ? (
            <Button title="Marchează ca verificată" kind="secondary" style={{ marginTop: S.md }} onPress={() => setStatus("reviewed")} />
          ) : null}
          {existing ? <Button title="Șterge tema" kind="danger" icon="trash-outline" style={{ marginTop: S.md }} onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
