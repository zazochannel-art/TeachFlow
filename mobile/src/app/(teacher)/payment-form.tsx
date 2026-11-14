import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DayStrip, StudentPicker } from "@/components/pickers";
import { Button, ChipRow, ErrorNote, Field, Label, TopBar, confirm, styles as ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { S } from "@/lib/theme";
import { dateKey } from "@/lib/time";
import type { Currency, Payment } from "@/lib/types";

const METHODS: { value: NonNullable<Payment["method"]> | ""; label: string }[] = [
  { value: "", label: "Nespecificat" }, { value: "cash", label: "Numerar" }, { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" }, { value: "other", label: "Altceva" }
];
const CURRENCIES: Currency[] = ["MDL", "EUR", "RON", "USD"];

export default function PaymentForm() {
  const { id, student } = useLocalSearchParams<{ id?: string; student?: string }>();
  const { data, reload } = useTeacher();
  const tz = data.timezone;
  const today = dateKey(new Date(), tz);
  const existing = id ? data.payments.find(p => p.id === id) : undefined;
  const startDate = existing?.status === "paid" && existing.paid_at ? existing.paid_at.slice(0, 10) : existing?.due_date ?? today;

  const [studentId, setStudentId] = useState<string | null>(existing?.student_id ?? student ?? null);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? (data.currency as Currency));
  const [status, setStatus] = useState<Payment["status"]>(existing?.status ?? "paid");
  const [day, setDay] = useState(startDate);
  const [method, setMethod] = useState<NonNullable<Payment["method"]> | "">(existing?.method ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!studentId) return setError("Alege elevul.");
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return setError("Scrie o sumă mai mare ca zero.");
    // Same rule as the web app: paid → paid_at, pending → due_date.
    const fields = {
      student_id: studentId, amount: Math.round(value * 100) / 100, currency, status,
      method: method || null, note: note.trim() || null,
      paid_at: status === "paid" ? new Date(`${day}T12:00:00Z`).toISOString() : null,
      due_date: status === "pending" ? day : null
    };
    setBusy(true);
    const { error } = existing
      ? await supabase.from("payments").update(fields).eq("id", existing.id).eq("teacher_id", data.userId)
      : await supabase.from("payments").insert({ ...fields, teacher_id: data.userId });
    setBusy(false);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  async function remove() {
    if (!existing || !(await confirm("Ștergi plata?", "Plata va fi ștearsă și din aplicația web."))) return;
    const { error } = await supabase.from("payments").delete().eq("id", existing.id).eq("teacher_id", data.userId);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <TopBar title={existing ? "Plată" : "Plată nouă"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.screenContent} keyboardShouldPersistTaps="handled">
          <ErrorNote text={error} />
          <StudentPicker students={data.students.filter(s => s.status === "active" || s.id === studentId)} value={studentId} onChange={setStudentId} />
          <Field label="Sumă" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="300" />
          <View style={{ marginBottom: S.lg }}><Label>Valută</Label><ChipRow options={CURRENCIES.map(c => ({ value: c, label: c }))} value={currency} onChange={setCurrency} /></View>
          <View style={{ marginBottom: S.lg }}>
            <Label>Stare</Label>
            <ChipRow options={[{ value: "paid", label: "Achitat" }, { value: "pending", label: "De încasat" }]} value={status} onChange={setStatus} />
          </View>
          <DayStrip value={day} onChange={setDay} today={today} />
          <View style={{ marginBottom: S.lg }}><Label>Metodă</Label><ChipRow options={METHODS} value={method} onChange={setMethod} /></View>
          <Field label="Notă" value={note} onChangeText={setNote} placeholder="ex. 4 lecții, noiembrie" maxLength={500} />
          <Button title={existing ? "Salvează" : "Adaugă plata"} onPress={save} loading={busy} />
          {existing ? <Button title="Șterge plata" kind="danger" icon="trash-outline" style={{ marginTop: S.md }} onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
