import { router } from "expo-router";
import { Text, View } from "react-native";
import { Avatar, Card, Divider, Empty, ListRow, PageTitle, Screen } from "@/components/ui";
import { conversations, studentMap } from "@/lib/derive";
import { useTeacher } from "@/lib/teacher-data";
import { C } from "@/lib/theme";
import { formatDate } from "@/lib/time";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function Messages() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const students = studentMap(data.students);
  const convs = conversations(data.students.filter(s => s.status === "active" || data.messages.some(m => m.student_id === s.id)), data.messages);

  return (
    <Screen onRefresh={reload}>
      <PageTitle title="Mesaje" subtitle="Conversațiile cu elevii tăi" />
      {convs.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {convs.map((c, i) => {
            const s = students[c.studentId];
            return (
              <View key={c.studentId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={s.full_name}
                  subtitle={c.last ? `${c.last.direction === "outgoing" ? "Tu: " : ""}${c.last.body}` : "Niciun mesaj încă"}
                  left={<Avatar name={s.full_name} />}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {c.last ? <Text style={{ fontSize: 12, color: C.muted }}>{formatDate(c.last.created_at, data.timezone)}</Text> : null}
                      {c.unread ? (
                        <View style={{ backgroundColor: C.primary, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, height: 20, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{c.unread}</Text>
                        </View>
                      ) : null}
                    </View>
                  }
                  onPress={() => router.push(`/chat/${c.studentId}`)}
                />
              </View>
            );
          })}
        </Card>
      ) : <Empty icon="chatbubbles-outline" text="Adaugă elevi ca să le poți scrie." />}
    </Screen>
  );
}
