import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { Avatar, Badge, Card, Divider, Empty, IconButton, ListRow, PageTitle, Screen, styles } from "@/components/ui";
import { useTeacher } from "@/lib/teacher-data";
import { S } from "@/lib/theme";
import { useNow, useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function Students() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const [q, setQ] = useState("");
  const list = data.students.filter(s => !q.trim() || s.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  const now = useNow();

  return (
    <Screen onRefresh={reload}>
      <PageTitle title="Elevi" subtitle={`${data.students.length} în total`}
        right={<IconButton icon="person-add" filled label="Elev nou" onPress={() => router.push("/student-form")} />} />
      {data.students.length > 5 ? (
        <TextInput value={q} onChangeText={setQ} placeholder="Caută elev…" style={[styles.input, { marginBottom: S.lg }]} />
      ) : null}
      {list.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {list.map((s, i) => {
            const next = data.lessons.find(l => l.student_id === s.id && l.status === "scheduled" && new Date(l.starts_at).getTime() > now);
            return (
              <View key={s.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={s.full_name}
                  subtitle={[s.email || s.phone, next ? "are lecții programate" : null].filter(Boolean).join(" · ") || undefined}
                  left={<Avatar name={s.full_name} />}
                  right={s.status === "inactive" ? <Badge label="Inactiv" tone="muted" /> : s.user_id ? <Badge label="În portal" tone="green" /> : undefined}
                  onPress={() => router.push(`/student/${s.id}`)}
                />
              </View>
            );
          })}
        </Card>
      ) : (
        <Empty icon="people-outline" text={q ? "Niciun elev găsit." : "Nu ai adăugat încă elevi."}
          action={q ? undefined : { label: "Adaugă primul elev", onPress: () => router.push("/student-form") }} />
      )}
    </Screen>
  );
}
