import Ionicons from "@expo/vector-icons/Ionicons";
import type { ColorValue } from "react-native";
import type { IconName } from "./ui";

export function tabIcon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} color={color as string} size={size} />;
  };
}
