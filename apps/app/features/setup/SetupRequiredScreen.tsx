import { Database, FileKey } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Body, H1, H2, Panel } from "@/components/ui";
import { colors } from "@/styles/theme";

export function SetupRequiredScreen() {
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Database color={colors.accent} size={30} strokeWidth={2.4} />
        </View>
        <H1>需要先连接 Supabase</H1>
        <Body style={styles.lead}>注册、情侣空间、相册、信件、推送和云宠数据都依赖 Supabase Auth、Postgres、Storage、RLS 和 RPC。</Body>
      </View>

      <Panel style={styles.panel}>
        <View style={styles.titleRow}>
          <FileKey color={colors.accentDark} size={20} />
          <H2>本地配置</H2>
        </View>
        <Body>复制环境变量模板并填入 Supabase Project URL 和 anon public key。</Body>
        <View style={styles.codeBlock}>
          <Text style={styles.code}>cp apps/app/.env.example apps/app/.env</Text>
          <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co</Text>
          <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxx</Text>
        </View>
      </Panel>

      <Panel style={styles.panel}>
        <H2>数据库初始化</H2>
        <Body>按文件名顺序应用全部 migration，然后重新启动 Web。</Body>
        <View style={styles.codeBlock}>
          <Text style={styles.code}>npm run db:apply</Text>
          <Text style={styles.code}>npm run check:env</Text>
          <Text style={styles.code}>npm run typecheck</Text>
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 640,
    justifyContent: "center",
    gap: 18,
    paddingVertical: 32,
  },
  hero: {
    gap: 14,
    maxWidth: 680,
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  lead: {
    maxWidth: 620,
    fontSize: 17,
    lineHeight: 26,
  },
  panel: {
    gap: 12,
    maxWidth: 720,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeBlock: {
    gap: 6,
    backgroundColor: "#2a2023",
    borderRadius: 8,
    padding: 14,
  },
  code: {
    color: "#fff7f4",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "monospace",
  },
});
