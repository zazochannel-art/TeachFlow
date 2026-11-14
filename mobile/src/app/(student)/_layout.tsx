import { Stack } from "expo-router";
import { Text } from "react-native";
import { Button, Card, Loading, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { StudentDataProvider, useStudentData } from "@/lib/student-data";
import { C } from "@/lib/theme";

function Gate() {
  const { data, loading, error, reload } = useStudentData();
  const { signOut } = useAuth();
  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <Card style={{ marginTop: 64, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>Nu am putut încărca datele</Text>
          <Text style={{ color: C.muted }}>{error ?? "Verifică conexiunea la internet."}</Text>
          <Button title="Încearcă din nou" onPress={reload} />
          <Button title="Deconectează-te" kind="ghost" onPress={signOut} />
        </Card>
      </Screen>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.canvas } }} />;
}

export default function StudentLayout() {
  return <StudentDataProvider><Gate /></StudentDataProvider>;
}
