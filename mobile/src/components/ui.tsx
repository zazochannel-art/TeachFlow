import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R, S } from "@/lib/theme";
import { initials } from "@/lib/time";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Scrollable page with pull-to-refresh. */
export function Screen({ children, onRefresh, edges = ["top"], padded = true }: {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  edges?: ("top" | "bottom")[];
  padded?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } } : undefined;
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[padded && styles.screenContent]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} /> : undefined}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.pageTitle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Top bar for pushed screens (with a back button). */
export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.iconBtn} accessibilityLabel="Înapoi">
        <Ionicons name="chevron-back" size={22} color={C.ink} />
      </Pressable>
      <Text numberOfLines={1} style={styles.topBarTitle}>{title}</Text>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function IconButton({ icon, onPress, label, filled }: { icon: IconName; onPress: () => void; label: string; filled?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, filled && styles.iconBtnFilled, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={filled ? "#fff" : C.ink} />
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={{ marginTop: S.xl }}>
      <View style={styles.sectionHead}>
        <Text style={styles.h2}>{title}</Text>
        {action ? <Pressable hitSlop={8} onPress={action.onPress}><Text style={styles.link}>{action.label}</Text></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";
export function Button({ title, onPress, kind = "primary", icon, loading, disabled, style }: {
  title: string; onPress: () => void; kind?: ButtonKind; icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === "primary" ? "#fff" : kind === "danger" ? C.red : C.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, styles[`btn_${kind}`], (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={C.muted} {...props}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, props.style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: color ?? C.primary, borderColor: color ?? C.primary }]}>
      <Text style={[styles.chipText, selected && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal list of choices. */
export function ChipRow<T extends string | number>({ options, value, onChange, wrap }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; wrap?: boolean;
}) {
  const chips = options.map(o => <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />);
  if (wrap) return <View style={styles.chipWrap}>{chips}</View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingVertical: 2 }}>{chips}</ScrollView>;
}

export function Avatar({ name, size = 40, color = C.primary }: { name: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontWeight: "800", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export type Tone = "primary" | "green" | "amber" | "red" | "muted";
const TONES: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: C.primary2, bg: C.tint },
  green: { fg: C.green, bg: C.greenBg },
  amber: { fg: C.amber, bg: C.amberBg },
  red: { fg: C.red, bg: C.redBg },
  muted: { fg: C.muted, bg: C.soft }
};

export function Badge({ label, tone = "primary" }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return <View style={[styles.badge, { backgroundColor: t.bg }]}><Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text></View>;
}

export function ListRow({ title, subtitle, left, right, onPress }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.soft }]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : null}
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: S.lg }} />;
}

export function Empty({ icon = "sparkles-outline", text, action }: { icon?: IconName; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={C.muted} />
      <Text style={styles.emptyText}>{text}</Text>
      {action ? <Button kind="secondary" title={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.canvas }}><ActivityIndicator size="large" color={C.primary} /></View>;
}

export function ErrorNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <View style={styles.error}><Ionicons name="alert-circle" size={18} color={C.red} /><Text style={styles.errorText}>{text}</Text></View>;
}

export function Stat({ label, value, icon, tone = "primary", onPress }: { label: string; value: string; icon: IconName; tone?: Tone; onPress?: () => void }) {
  const t = TONES[tone];
  return (
    <Card onPress={onPress} style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={18} color={t.fg} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

/** Confirmation dialog that also works on web. */
export function confirm(title: string, message: string, okLabel = "Șterge"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`));
  return new Promise(resolve => Alert.alert(title, message, [
    { text: "Anulează", style: "cancel", onPress: () => resolve(false) },
    { text: okLabel, style: "destructive", onPress: () => resolve(true) }
  ]));
}

export function notify(title: string, message?: string) {
  if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title); return; }
  Alert.alert(title, message);
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  screenContent: { padding: S.lg, paddingBottom: 48 },
  pageTitle: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.lg },
  h1: { fontSize: 26, fontWeight: "800", color: C.ink },
  h2: { fontSize: 17, fontWeight: "800", color: C.ink },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 2 },
  link: { color: C.primary, fontWeight: "700", fontSize: 14 },
  topBar: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingVertical: S.sm, backgroundColor: C.canvas },
  topBarTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: C.ink, textAlign: "center" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: C.panel },
  iconBtnFilled: { backgroundColor: C.primary },
  card: { backgroundColor: C.panel, borderRadius: R.lg, padding: S.lg, shadowColor: C.ink, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.md },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, height: 48, borderRadius: R.md, paddingHorizontal: S.lg },
  btn_primary: { backgroundColor: C.primary },
  btn_secondary: { backgroundColor: C.tint },
  btn_danger: { backgroundColor: C.redBg },
  btn_ghost: { backgroundColor: "transparent" },
  btnText: { fontSize: 15, fontWeight: "800" },
  label: { fontSize: 13, fontWeight: "700", color: C.ink, marginBottom: 6 },
  hint: { fontSize: 12, color: C.muted, marginTop: 4 },
  input: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.ink },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 14, fontWeight: "700", color: C.ink },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: 14 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  rowSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  empty: { alignItems: "center", gap: S.md, padding: S.xl },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center" },
  error: { flexDirection: "row", gap: S.sm, alignItems: "center", backgroundColor: C.redBg, padding: S.md, borderRadius: R.md, marginBottom: S.lg },
  errorText: { color: C.red, flex: 1, fontSize: 14 },
  stat: { flexBasis: "47%", flexGrow: 1, padding: S.lg, gap: 4 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 13, color: C.muted }
});
