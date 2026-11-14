import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Badge, Button, Card, ChipRow, Empty, IconButton, Screen, TopBar } from "@/components/ui";
import { studentMap } from "@/lib/derive";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { dateKey, formatDate, formatMoney } from "@/lib/time";
import { useReloadOnFocus } from "@/lib/use-auto-refresh";

type Filter = "all" | "pending" | "paid";

export default function Payments() {
  const { data, reload } = useTeacher();
  useReloadOnFocus(reload);
  const [filter, setFilter] = useState<Filter>("all");
  const students = studentMap(data.students);
  const tz = data.timezone;
  const month = dateKey(new Date(), tz).slice(0, 7);
  const paidThisMonth = data.payments.filter(p => p.status === "paid" && p.paid_at && dateKey(new Date(p.paid_at), tz).startsWith(month)).reduce((a, p) => a + p.amount, 0);
  const pending = data.payments.filter(p => p.status === "pending").reduce((a, p) => a + p.amount, 0);
  const list = data.payments.filter(p => filter === "all" || p.status === filter);

  async function markPaid(id: string) {
    await supabase.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("teacher_id", data.userId);
    reload();
  }

  return (
    <Screen edges={["top"]} padded={false} onRefresh={reload}>
      <TopBar title="Plăți" right={<IconButton icon="add" filled label="Plată nouă" onPress={() => router.push("/payment-form")} />} />
      <View style={{ padding: S.lg }}>
        <View style={{ flexDirection: "row", gap: S.md, marginBottom: S.lg }}>
          <Card style={{ flex: 1 }}><Text style={{ color: C.muted }}>Încasat luna asta</Text><Text style={{ fontSize: 20, fontWeight: "800", color: C.green }}>{formatMoney(paidThisMonth, data.currency)}</Text></Card>
          <Card style={{ flex: 1 }}><Text style={{ color: C.muted }}>De încasat</Text><Text style={{ fontSize: 20, fontWeight: "800", color: C.amber }}>{formatMoney(pending, data.currency)}</Text></Card>
        </View>
        <ChipRow<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "Toate" }, { value: "pending", label: "De încasat" }, { value: "paid", label: "Achitate" }]} />
        <View style={{ marginTop: S.lg }}>
          {list.length ? list.map(p => (
            <Card key={p.id} onPress={() => router.push(`/payment-form?id=${p.id}`)} style={{ marginBottom: S.sm, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontWeight: "800", fontSize: 16, color: C.ink }}>{formatMoney(p.amount, p.currency)}</Text>
                <Badge label={p.status === "paid" ? "Achitat" : "De încasat"} tone={p.status === "paid" ? "green" : "amber"} />
              </View>
              <Text style={{ color: C.muted }}>
                {students[p.student_id]?.full_name ?? "—"} · {p.status === "paid" && p.paid_at ? formatDate(p.paid_at, tz) : p.due_date ? `scadent ${formatDate(p.due_date + "T12:00:00Z", tz)}` : ""}
                {p.note ? ` · ${p.note}` : ""}
              </Text>
              {p.status === "pending" ? <Button title="Marchează achitat" kind="secondary" icon="checkmark" onPress={() => markPaid(p.id)} /> : null}
            </Card>
          )) : <Empty icon="wallet-outline" text="Nicio plată aici." action={{ label: "Adaugă plată", onPress: () => router.push("/payment-form") }} />}
        </View>
      </View>
    </Screen>
  );
}
