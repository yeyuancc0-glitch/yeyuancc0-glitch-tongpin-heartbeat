import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/features/auth/AuthProvider";

export default function RootLayout() {
  return (
    <ToastProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ToastProvider>
  );
}
