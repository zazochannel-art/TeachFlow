import { router } from "expo-router";
import { View } from "react-native";
import { Avatar, Card, Divider, Empty, ListRow, PageTitle, Screen } from "@/components/ui";
import { useStudentData } from "@/lib/student-data";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

export default function StudentInbox() {
  const { data, reload } = useStudentData();
  useReloadOnFocus(reload);
  if (!data) return null;
  return (
    <Screen onRefresh={reload}>
      <PageTitle title="Mesaje" subtitle="Scrie-i profesorului" />
      {data.records.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {data.records.map((r, i) => {
            const msgs = data.messages.filter(m => m.student_id === r.id);
            const last = msgs[msgs.length - 1];
            const name = data.teachers[r.teacher_id] ?? "Profesor";
            return (
              <View key={r.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={name} subtitle={last ? `${last.direction === "incoming" ? "Tu: " : ""}${last.body}` : "Niciun mesaj încă"}
                  left={<Avatar name={name} />} onPress={() => router.push(`/conversatie/${r.id}`)} />
              </View>
            );
          })}
        </Card>
      ) : <Empty text="Nu ești încă legat de un profesor." />}
    </Screen>
  );
}
