import { StyleSheet } from "react-native";
import { C, S } from "@/lib/theme";

export const authStyles = StyleSheet.create({
  hero: { alignItems: "center", marginTop: 48, marginBottom: S.xxl, gap: S.sm },
  brand: { fontSize: 30, fontWeight: "900", color: C.navy, marginTop: S.sm },
  tagline: { fontSize: 15, color: C.muted, textAlign: "center" },
  forgot: { alignSelf: "center", padding: S.lg },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: S.sm },
  muted: { color: C.muted, fontSize: 14 },
  link: { color: C.primary, fontWeight: "800", fontSize: 14 }
});
