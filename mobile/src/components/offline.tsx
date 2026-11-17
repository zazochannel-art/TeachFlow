import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Palette } from "@/lib/config";

/** Shown instead of the page when the site cannot be reached (no internet, server down). */
export function Offline({ palette, onRetry }: { palette: Palette; onRetry: () => void }) {
  return (
    <View style={[styles.wrap, { backgroundColor: palette.canvas }]}>
      <View style={[styles.card, { backgroundColor: palette.panel }]}>
        <Text style={styles.icon}>📡</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Nu există conexiune</Text>
        <Text style={[styles.text, { color: palette.muted }]}>
          TeachFlow are nevoie de internet. Verifică Wi‑Fi-ul sau datele mobile și încearcă din nou.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.button, { backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={styles.buttonText}>Încearcă din nou</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 24, padding: 28, alignItems: "center" },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  text: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 20 },
  button: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" }
});
