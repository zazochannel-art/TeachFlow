import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

/** What the web page is told about push on this phone (window.TeachFlowNative.push). */
export interface PushState {
  /** granted / denied / undetermined: the Android permission. unavailable: no token can be made (emulator, missing EAS project id or Firebase setup). */
  status: "granted" | "denied" | "undetermined" | "unavailable";
  token: string | null;
}

// Notifications that arrive while the app is open are still shown as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

let channelReady = false;
async function ensureChannel() {
  if (channelReady || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "TeachFlow",
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: "#5269E8"
  });
  channelReady = true;
}

const projectId = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Reads (and, when `ask` is true and Android has not been asked yet, requests) the notification
 * permission, then gets the Expo push token. The server sends to that token through Expo's push
 * service (src/lib/push/server.ts in the web app). Never throws.
 */
export async function loadPush(ask: boolean): Promise<PushState> {
  try {
    if (!Device.isDevice) return { status: "unavailable", token: null };
    await ensureChannel();
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted" && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return { status: perm.status === "denied" ? "denied" : "undetermined", token: null };
    const id = projectId();
    if (!id) return { status: "unavailable", token: null };
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { status: "granted", token: data };
  } catch (e) {
    console.warn("push token", e instanceof Error ? e.message : e);
    return { status: "unavailable", token: null };
  }
}
