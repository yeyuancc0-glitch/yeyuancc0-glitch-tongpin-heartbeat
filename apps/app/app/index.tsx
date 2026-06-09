import { SafeAreaView } from "react-native-safe-area-context";

import { AppScroll, AppShell, Screen } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuth } from "@/features/auth/AuthProvider";
import { HomeScreen, HomeScreenShell } from "@/features/home/HomeScreen";
import { SetupRequiredScreen } from "@/features/setup/SetupRequiredScreen";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function IndexPage() {
  const { user, loading, passwordRecovery } = useAuth();

  return (
    <Screen>
      <SafeAreaView>
        <AppScroll>
          <AppShell>
            {!isSupabaseConfigured ? (
              <SetupRequiredScreen />
            ) : loading ? (
              <HomeScreenShell />
            ) : passwordRecovery ? (
              <AuthScreen />
            ) : user ? (
              <HomeScreen />
            ) : (
              <AuthScreen />
            )}
          </AppShell>
        </AppScroll>
      </SafeAreaView>
    </Screen>
  );
}
