import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { HOMEWORK_STATUS } from "@/components/homework-status";
import { Badge, Card, ChipRow, Empty, IconButton, Screen, TopBar } from "@/components/ui";
import { studentMap } from "@/lib/derive";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { formatDate } from "@/lib/time";
import type { HomeworkStatus } from "@/lib/types";
import { useNow, useReloadOnFocus } from "@/lib/use-auto-refresh";

type Filter = "all" | HomeworkStatus;

export default function HomeworkList() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const now = useNow();
  const [filter, setFilter] = useState<Filter>(data.homework.some(h => h.status === "submitted") ? "submitted" : "all");
  const students = studentMap(data.students);
  const list = data.homework.filter(h => filter === "all" || h.status === filter);
  const count = (s: HomeworkStatus) => data.homework.filter(h => h.status === s).length;

  return (
    <Screen edges={["top"]} padded={false} onRefresh={reload}>
      <TopBar title="Teme" right={<IconButton icon="add" filled label="Temă nouă" onPress={() => router.push("/homework-form")} />} />
      <View style={{ padding: S.lg }}>
        <ChipRow<Filter> value={filter} onChange={setFilter} options={[
          { value: "all", label: `Toate (${data.homework.length})` },
          { value: "submitted", label: `De verificat (${count("submitted")})` },
          { value: "assigned", label: `Atribuite (${count("assigned")})` },
          { value: "reviewed", label: `Verificate (${count("reviewed")})` }
        ]} />
        <View style={{ marginTop: S.lg }}>
          {list.length ? list.map(h => {
            const st = HOMEWORK_STATUS[h.status];
            const overdue = h.status === "assigned" && h.due_at && new Date(h.due_at).getTime() < now;
            return (
              <Card key={h.id} onPress={() => router.push(`/homework-form?id=${h.id}`)} style={{ marginBottom: S.sm, gap: 6 }}>
                <Text style={{ fontWeight: "800", fontSize: 15, color: C.ink }}>{h.title}</Text>
                <Text style={{ color: C.muted }}>{students[h.student_id]?.full_name ?? "—"}</Text>
                <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
                  <Badge label={st.label} tone={st.tone} />
                  {overdue ? <Badge label="Termen depășit" tone="red" /> : null}
                  {h.due_at ? <Text style={{ color: C.muted, fontSize: 13 }}>termen {formatDate(h.due_at, data.timezone)}</Text> : null}
                  {h.grade ? <Text style={{ color: C.ink, fontWeight: "800", fontSize: 13 }}>nota {h.grade}</Text> : null}
                </View>
              </Card>
            );
          }) : <Empty icon="document-text-outline" text="Nicio temă aici." action={{ label: "Atribuie o temă", onPress: () => router.push("/homework-form") }} />}
        </View>
      </View>
    </Screen>
  );
}
