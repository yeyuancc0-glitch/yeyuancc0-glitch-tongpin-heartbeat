import { Link } from "expo-router";
import { StyleSheet } from "react-native";

import { AppShell, Body, H1, Panel, Screen } from "@/components/ui";
import { colors } from "@/styles/theme";

export default function NotFound() {
  return (
    <Screen>
      <AppShell>
        <Panel style={styles.panel}>
          <H1>页面不存在</H1>
          <Body>回到首页继续使用同频跳动。</Body>
          <Link href="/" style={styles.link}>
            回到首页
          </Link>
        </Panel>
      </AppShell>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  link: {
    color: colors.accentDark,
    fontWeight: "800",
  },
});
