import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { C } from "@/lib/theme";

export function Logo({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="school" size={size * 0.55} color="#fff" />
    </View>
  );
}
