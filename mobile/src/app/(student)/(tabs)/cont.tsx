import { Text, View } from "react-native";
import { Avatar, Badge, Button, Card, PageTitle, Screen, Section } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useStudentData } from "@/lib/student-data";
import { C, S } from "@/lib/theme";
import { formatDate, formatMoney } from "@/lib/time";

export default function StudentAccount() {
  const { data } = useStudentData();
  const { session, signOut } = useAuth();
  if (!data) return null;
  return (
    <Screen>
      <PageTitle title="Cont" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <Avatar name={data.fullName || session?.user.email || "?"} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.ink }}>{data.fullName || "Elev"}</Text>
          <Text style={{ color: C.muted }}>{session?.user.email}</Text>
        </View>
      </Card>
      <Section title="Plăți">
        {data.payments.length ? data.payments.slice(0, 10).map(p => (
          <Card key={p.id} style={{ marginBottom: S.sm, flexDirection: "row", alignItems: "center", gap: S.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: C.ink }}>{formatMoney(p.amount, p.currency)}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{p.paid_at ? formatDate(p.paid_at, data.timezone) : p.due_date ? `scadent ${formatDate(p.due_date + "T12:00:00Z", data.timezone)}` : ""}</Text>
            </View>
            <Badge label={p.status === "paid" ? "Achitat" : "De achitat"} tone={p.status === "paid" ? "green" : "amber"} />
          </Card>
        )) : <Text style={{ color: C.muted }}>Nicio plată.</Text>}
      </Section>
      <Button title="Deconectează-te" kind="danger" icon="log-out-outline" onPress={signOut} style={{ marginTop: S.xl }} />
    </Screen>
  );
}
