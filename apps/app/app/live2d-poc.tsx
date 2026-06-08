import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
import { Live2DCanvas } from "@/features/pet/components/Live2DCanvas";
import { activeLive2DPet } from "@/features/pet/live2dCatalog";
import { colors } from "@/styles/theme";

const supportedActions: LivePetVisualAction[] = activeLive2DPet.supportedActions;

export default function Live2DPocPage() {
  const [action, setAction] = useState<LivePetVisualAction>("idle");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const value = new URLSearchParams(window.location.search).get("action") ?? "idle";
    setAction(supportedActions.includes(value as LivePetVisualAction) ? value as LivePetVisualAction : "idle");
  }, []);

  return (
    <View style={styles.page}>
      <View style={styles.stage} {...({ dataSet: { live2dPoc: "little-cat" } } as Record<string, unknown>)}>
        <Live2DCanvas petConfig={activeLive2DPet} action={action} actionKey={action} />
      </View>
      <Text style={styles.status}>{activeLive2DPet.label} Live2D POC · {action} / physics</Text>
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
