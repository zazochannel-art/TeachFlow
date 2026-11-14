import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { C, R, S } from "@/lib/theme";
import { addDays, formatShortDay } from "@/lib/time";
import type { Student } from "@/lib/types";
import { Chip, Label } from "./ui";

/** Horizontal strip of the next days, starting a few days before `from`. */
export function DayStrip({ value, onChange, today, days = 45 }: { value: string; onChange: (v: string) => void; today: string; days?: number }) {
  const start = value < today ? value : addDays(today, -3);
  const keys = Array.from({ length: days }, (_, i) => addDays(start, i));
  const month = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
  return (
    <View style={{ marginBottom: S.lg }}>
      <Label>{`Data · ${month}`}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {keys.map(k => {
          const f = formatShortDay(k);
          const active = k === value;
          return (
            <Pressable key={k} onPress={() => onChange(k)} style={[styles.day, active && styles.dayActive]}>
              <Text style={[styles.dayName, active && { color: "#fff" }]}>{k === today ? "Azi" : f.weekday}</Text>
              <Text style={[styles.dayNum, active && { color: "#fff" }]}>{f.day}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function StudentPicker({ students, value, onChange, allowNone }: { students: Student[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <View style={{ marginBottom: S.lg }}>
      <Label>Elev</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {allowNone ? <Chip label="Fără elev" selected={!value} onPress={() => onChange(null)} /> : null}
        {students.map(s => <Chip key={s.id} label={s.full_name} selected={value === s.id} onPress={() => onChange(s.id)} />)}
      </ScrollView>
      {!students.length ? <Text style={{ color: C.muted }}>Adaugă întâi un elev.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { width: 54, paddingVertical: 10, alignItems: "center", borderRadius: R.md, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  dayActive: { backgroundColor: C.primary, borderColor: C.primary },
  dayName: { fontSize: 11, fontWeight: "700", color: C.muted },
  dayNum: { fontSize: 17, fontWeight: "800", color: C.ink }
});
