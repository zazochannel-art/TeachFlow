import { useState } from "react";
import { Text, View } from "react-native";
import { HOMEWORK_STATUS } from "@/components/homework-status";
import { Badge, Button, Card, Empty, ErrorNote, Field, PageTitle, Screen } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { useStudentData } from "@/lib/student-data";
import { supabase } from "@/lib/supabase";
import { C, S } from "@/lib/theme";
import { formatDate } from "@/lib/time";
import type { Homework } from "@/lib/types";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

function HomeworkCard({ h, tz, onDone }: { h: Homework; tz: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(h.submission ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = HOMEWORK_STATUS[h.status];

  async function submit() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("submit_homework", { p_homework_id: h.id, p_submission: text });
    setBusy(false);
    if (error) return setError(friendlyError(error.message));
    setOpen(false);
    await onDone();
  }

  return (
    <Card style={{ marginBottom: S.sm, gap: 6 }}>
      <Text style={{ fontWeight: "800", fontSize: 15, color: C.ink }}>{h.title}</Text>
      <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
        <Badge label={st.label} tone={st.tone} />
        {h.due_at ? <Text style={{ color: C.muted, fontSize: 13 }}>termen {formatDate(h.due_at, tz)}</Text> : null}
        {h.grade ? <Text style={{ color: C.ink, fontWeight: "800" }}>nota {h.grade}</Text> : null}
      </View>
      {h.description ? <Text style={{ color: C.ink }}>{h.description}</Text> : null}
      {h.feedback ? <Text style={{ color: C.green }}>Feedback: {h.feedback}</Text> : null}
      {h.status !== "reviewed" ? (
        open ? (
          <View style={{ marginTop: S.sm }}>
            <ErrorNote text={error} />
            <Field label="Răspunsul tău" value={text} onChangeText={setText} multiline maxLength={8000} />
            <Button title="Predă tema" onPress={submit} loading={busy} />
          </View>
        ) : <Button title={h.status === "submitted" ? "Modifică răspunsul" : "Scrie răspunsul"} kind="secondary" onPress={() => setOpen(true)} />
      ) : null}
    </Card>
  );
}

export default function StudentHomework() {
  const { data, reload } = useStudentData();
  useReloadOnFocus(reload);
  if (!data) return null;
  return (
    <Screen onRefresh={reload}>
      <PageTitle title="Teme" subtitle="Predă temele direct din telefon" />
      {data.homework.length ? data.homework.map(h => <HomeworkCard key={h.id} h={h} tz={data.timezone} onDone={reload} />)
        : <Empty icon="document-text-outline" text="Nu ai teme momentan." />}
    </Screen>
  );
}
