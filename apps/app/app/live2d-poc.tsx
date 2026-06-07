import { StyleSheet, Text, View } from "react-native";

import { Live2DCanvas } from "@/features/pet/components/Live2DCanvas";
import { colors } from "@/styles/theme";

export default function Live2DPocPage() {
  return (
    <View style={styles.page}>
      <View style={styles.stage} {...({ dataSet: { live2dPoc: "little-cat" } } as Record<string, unknown>)}>
        <Live2DCanvas action="idle" />
      </View>
      <Text style={styles.status}>LittleCat Live2D POC · idle / physics</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: "100vh" as never,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff8f6",
  },
  stage: {
    width: "min(420px, 92vw)" as never,
    height: "min(560px, 78vh)" as never,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff0f5",
    backgroundImage: "radial-gradient(circle at 50% 20%, #fff 0%, #fff0f5 46%, #edf4f6 100%)" as never,
    boxShadow: "0 24px 60px rgba(116,74,89,0.16)",
  },
  status: {
    marginTop: 14,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
  },
});
