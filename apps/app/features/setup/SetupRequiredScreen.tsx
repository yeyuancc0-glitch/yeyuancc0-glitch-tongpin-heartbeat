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
        <H1>需要先连接自建服务器</H1>
        <Body style={styles.lead}>注册、情侣空间、相册、信件、推送和云宠数据都依赖自建 API、Postgres、MinIO、Redis 和 Push worker。</Body>
      </View>

      <Panel style={styles.panel}>
        <View style={styles.titleRow}>
          <FileKey color={colors.accentDark} size={20} />
          <H2>本地配置</H2>
        </View>
        <Body>复制环境变量模板并填入自建 API 地址。</Body>
        <View style={styles.codeBlock}>
          <Text style={styles.code}>cp apps/app/.env.example apps/app/.env</Text>
          <Text style={styles.code}>EXPO_PUBLIC_SELF_HOST_API_URL=https://api-staging.fancah.tech</Text>
        </View>
      </Panel>

      <Panel style={styles.panel}>
        <H2>数据库初始化</H2>
        <Body>确认服务器 migration、worker、备份和健康检查都已通过，然后重新启动 Web。</Body>
        <View style={styles.codeBlock}>
          <Text style={styles.code}>ssh -i ~/Desktop/codex.pem -o IdentitiesOnly=yes ubuntu@81.71.9.118</Text>
          <Text style={styles.code}>cd /opt/tongpin && sh scripts/apply-db-migrations.sh</Text>
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
