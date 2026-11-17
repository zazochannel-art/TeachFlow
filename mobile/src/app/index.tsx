import { File, Paths } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Linking, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import { Offline } from "@/components/offline";
import { parseMessage, stateScript } from "@/lib/bridge";
import { APP_VERSION, COLORS, WEB_URL, isOwnUrl, siteUrl } from "@/lib/config";
import { loadPush, type PushState } from "@/lib/push";

/** The WebView methods the screen uses (the class type is generic over its props). */
type WebHandle = Pick<WebView, "injectJavaScript" | "goBack" | "reload">;

const INTERNAL_SCHEMES = ["about:", "data:", "blob:", "javascript:"];
const KEEP_AWAKE_TAG = "teachflow-call";

/** Opens a link outside the app (browser, phone, mail, WhatsApp…). */
function openOutside(url: string) {
  Linking.openURL(url).catch(() => {});
}

/**
 * The whole app: the TeachFlow site in a full-screen WebView, plus what a browser tab cannot do —
 * native push notifications, the Android back button, saving files, an offline screen and links
 * that open in the right app. Accounts and data are the site's, so web and Android stay in sync.
 */
export default function AppScreen() {
  const web = useRef<WebHandle | null>(null);
  const canGoBack = useRef(false);
  const loaded = useRef(false);
  const [dark, setDark] = useState(false);
  const [push, setPush] = useState<PushState>({ status: "undetermined", token: null });
  const palette = dark ? COLORS.dark : COLORS.light;

  // ---------- where to start: the page of the notification that opened the app, or the home page
  const lastResponse = Notifications.useLastNotificationResponse();
  const responseId = lastResponse?.notification.request.identifier ?? null;
  const responseUrl = lastResponse ? siteUrl(lastResponse.notification.request.content.data?.url) : null;
  const [start, setStart] = useState<{ url: string; id: string | null } | null>(null);
  if (!start && lastResponse !== undefined) setStart({ url: responseUrl ?? WEB_URL, id: responseId });
  // A notification tapped while the app is already open moves the page there.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!start || !responseId || responseId === start.id || responseId === handled.current) return;
    handled.current = responseId;
    if (responseUrl) web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(responseUrl)});true;`);
  }, [start, responseId, responseUrl]);

  // ---------- push: read silently at start and whenever the app comes back (permission may change in Settings)
  const refreshPush = useCallback((ask: boolean) =>
    loadPush(ask).then(next => setPush(prev => (prev.status === next.status && prev.token === next.token ? prev : next))), []);
  useEffect(() => {
    void refreshPush(false);
    const sub = AppState.addEventListener("change", s => { if (s === "active") void refreshPush(false); });
    return () => sub.remove();
  }, [refreshPush]);
  const bridge = useMemo(() => stateScript(push), [push]);
  useEffect(() => { if (loaded.current) web.current?.injectJavaScript(bridge); }, [bridge]);

  // ---------- Android back button walks back through the site, then leaves the app
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onNavigation = (s: WebViewNavigation) => { canGoBack.current = s.canGoBack; };

  // Pages of the site stay inside; everything else (other sites, tel:, mailto:, WhatsApp) opens outside.
  const onShouldStart = (req: ShouldStartLoadRequest) => {
    if (req.isTopFrame === false) return true;
    if (isOwnUrl(req.url) || INTERNAL_SCHEMES.some(s => req.url.startsWith(s))) return true;
    openOutside(req.url);
    return false;
  };

  // Links with target="_blank": own pages open in place, files and other sites outside.
  const onOpenWindow = (e: WebViewOpenWindowEvent) => {
    const url = e.nativeEvent.targetUrl;
    if (isOwnUrl(url)) web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)});true;`);
    else if (url) openOutside(url);
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    const msg = parseMessage(e.nativeEvent.data);
    if (!msg) return;
    switch (msg.type) {
      case "ready": // a signed-in page: ask for notifications once, the first time
        if (push.status === "undetermined") void refreshPush(true);
        else web.current?.injectJavaScript(bridge);
        break;
      case "push:enable":
        if (push.status === "denied") Linking.openSettings().catch(() => {});
        else void refreshPush(true);
        break;
      case "theme":
        setDark(!!msg.dark);
        break;
      case "open":
        if (typeof msg.url === "string") openOutside(msg.url);
        break;
      case "keep-awake": // during a call: the screen must not go dark (the camera would stop)
        if (msg.on) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
        else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
        break;
      case "file:save":
        try {
          const name = String(msg.name || "teachflow").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
          const file = new File(Paths.cache, name);
          if (file.exists) file.delete();
          await file.write(msg.base64, { encoding: "base64" });
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: msg.mime, dialogTitle: name });
        } catch (err) {
          console.warn("save file", err instanceof Error ? err.message : err);
        }
        break;
    }
  };

  const onLoadEnd = () => {
    if (!loaded.current) {
      loaded.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  };

  // If the network is down at start the splash still has to go away (the offline screen shows instead).
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.fill, { backgroundColor: palette.canvas }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      {start && (
        <WebView
          ref={r => { web.current = r; }}
          source={{ uri: start.url }}
          style={[styles.fill, { backgroundColor: palette.canvas }]}
          applicationNameForUserAgent={`TeachFlowApp/${APP_VERSION}`}
          injectedJavaScriptBeforeContentLoaded={bridge}
          onMessage={onMessage}
          onNavigationStateChange={onNavigation}
          onShouldStartLoadWithRequest={onShouldStart}
          onOpenWindow={onOpenWindow}
          setSupportMultipleWindows
          onLoadEnd={onLoadEnd}
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => web.current?.reload()}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowFileAccess={false}
          overScrollMode="never"
          textZoom={100}
          pullToRefreshEnabled={false}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.center, { backgroundColor: palette.canvas }]}>
              <ActivityIndicator size="large" color={palette.primary} />
            </View>
          )}
          renderError={() => <Offline palette={palette} onRetry={() => web.current?.reload()} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" }
});
