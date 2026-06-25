import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppScroll, AppShell, Screen } from "@/components/ui";
import { AuthLinkScreen } from "@/features/auth/AuthLinkScreen";

export default function ResetPasswordPage() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();

  return (
    <Screen>
      <SafeAreaView>
        <AppScroll>
          <AppShell>
            <AuthLinkScreen mode="resetPassword" token={token} />
          </AppShell>
        </AppScroll>
      </SafeAreaView>
    </Screen>
  );
}
