import { useEffect } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useMotion } from "@/motion/MotionProvider";

export function BreathingSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { reducedMotion } = useMotion();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      breath.value = 0.38;
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: 1650, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breath, reducedMotion]);

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + breath.value * 0.4,
  }));

  return (
    <View pointerEvents="none" style={[styles.skeleton, style]}>
      <Reanimated.View style={[styles.sheen, sheenStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
    backgroundColor: "rgba(247,226,232,0.48)",
  },
  sheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.52)",
    ...(Platform.OS === "web"
      ? ({
          backgroundImage: "linear-gradient(105deg, rgba(255,255,255,0.18), rgba(255,255,255,0.76), rgba(255,255,255,0.22))",
        } as object)
      : {}),
  },
});
