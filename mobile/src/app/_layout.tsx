import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, role, ready } = useAuth();

  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return <Loading />;

  const signedIn = !!session;
  const isTeacher = signedIn && (role === "teacher" || role === "admin");
  const isStudent = signedIn && role === "student";

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.canvas } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={isTeacher}>
        <Stack.Screen name="(teacher)" />
      </Stack.Protected>
      <Stack.Protected guard={isStudent}>
        <Stack.Screen name="(student)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !isTeacher && !isStudent}>
        <Stack.Screen name="no-role" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
