import { useCallback } from "react";
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { haptics } from "@/motion/haptics";

export function useErrorShake() {
  const offset = useSharedValue(0);

  const triggerShake = useCallback(() => {
    haptics.error();
    offset.value = withSequence(
      withTiming(10, { duration: 42 }),
      withTiming(-10, { duration: 42 }),
      withTiming(6, { duration: 42 }),
      withTiming(-4, { duration: 42 }),
      withTiming(0, { duration: 70 }),
    );
  }, [offset]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return { triggerShake, shakeStyle };
}
