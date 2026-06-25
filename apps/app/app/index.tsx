import { SafeAreaView } from "react-native-safe-area-context";

import { AppScroll, AppShell, Screen } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuth } from "@/features/auth/AuthProvider";
import { HomeScreen, HomeScreenShell } from "@/features/home/HomeScreen";
import { SetupRequiredScreen } from "@/features/setup/SetupRequiredScreen";
import { isSelfHostConfigured } from "@/lib/selfHost/config";

export default function IndexPage() {
  const { user, loading, passwordRecovery } = useAuth();
  const isAuthConfigured = isSelfHostConfigured;

  return (
    <Screen>
      <SafeAreaView>
        <AppScroll>
          <AppShell>
            {!isAuthConfigured ? (
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
