import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Image, Platform, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { haptics } from "@/motion/haptics";
import { motionTokens } from "@/motion/tokens";
import { colors } from "@/styles/theme";

export type MotionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MotionFlightRequest = {
  id?: string;
  label: string;
  icon?: string;
  image?: ImageSourcePropType;
  origin?: MotionRect | null;
  target?: MotionRect | null;
};

export function MotionLayer({
  flights,
  reducedMotion,
  onFlightDone,
}: {
  flights: MotionFlightRequest[];
  reducedMotion: boolean;
  onFlightDone: (id: string) => void;
}) {
  if (!flights.length) {
    return null;
  }

  const layer = (
    <View pointerEvents="none" style={styles.layer}>
      {flights.map((flight) => (
        <QuickInteractionFlight key={flight.id} flight={flight} reducedMotion={reducedMotion} onDone={onFlightDone} />
      ))}
    </View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(layer, document.body);
  }

  return layer;
}

function QuickInteractionFlight({
  flight,
  reducedMotion,
  onDone,
}: {
  flight: MotionFlightRequest;
  reducedMotion: boolean;
  onDone: (id: string) => void;
}) {
  const progress = useSharedValue(0);
  const impact = useSharedValue(0);
  const id = flight.id!;
  const origin = flight.origin ?? defaultOrigin();
  const target = flight.target ?? defaultTarget(origin);
  const originCenter = centerOf(origin);
  const targetCenter = centerOf(target);
  const arcY = Math.min(originCenter.y, targetCenter.y) - 108;

  useEffect(() => {
    if (reducedMotion) {
      impact.value = withTiming(1, { duration: motionTokens.fadeMs }, (finished) => {
        if (finished) {
          runOnJS(haptics.success)();
          runOnJS(onDone)(id);
        }
      });
      return;
    }

    progress.value = withTiming(1, { duration: motionTokens.quickFlightDurationMs, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) {
        runOnJS(onDone)(id);
      }
    });
    const timeout = setTimeout(() => {
      haptics.success();
      impact.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) });
    }, Math.round(motionTokens.quickFlightDurationMs * 0.72));
    return () => clearTimeout(timeout);
  }, [id, impact, onDone, progress, reducedMotion]);

  const flightStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return {
        opacity: 0,
      };
    }
    const x = interpolate(progress.value, [0, 0.5, 1], [originCenter.x, (originCenter.x + targetCenter.x) / 2, targetCenter.x]);
    const y = interpolate(progress.value, [0, 0.52, 1], [originCenter.y, arcY, targetCenter.y]);
    return {
      opacity: interpolate(progress.value, [0, 0.08, 0.84, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: x - 24 },
        { translateY: y - 18 },
        { scale: interpolate(progress.value, [0, 0.34, 1], [0.92, 0.82, 0.52]) },
        { rotate: `${interpolate(progress.value, [0, 1], [-8, 18])}deg` },
      ],
    };
  });

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(impact.value, [0, 0.12, 1], [0, 0.52, 0]),
    transform: [
      { translateX: targetCenter.x - 50 },
      { translateY: targetCenter.y - 50 },
      { scale: interpolate(impact.value, [0, 1], [0.46, 1.42]) },
    ],
  }));

  const innerRippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(impact.value, [0, 0.16, 0.78, 1], [0, 0.7, 0.28, 0]),
    transform: [
      { translateX: targetCenter.x - 34 },
      { translateY: targetCenter.y - 34 },
      { scale: interpolate(impact.value, [0, 1], [0.72, 1.08]) },
    ],
  }));

  return (
    <>
      <Reanimated.View style={[styles.ripple, rippleStyle]} />
      <Reanimated.View style={[styles.innerRipple, innerRippleStyle]} />
      <Reanimated.View style={[styles.flightCapsule, flightStyle]}>
        <View style={styles.flightHalfRose} />
        <View style={styles.flightHalfCream} />
        <View style={styles.flightIconWrap}>
          {flight.image ? <Image source={flight.image} style={styles.flightImage} resizeMode="contain" /> : <Text style={styles.flightIcon}>{flight.icon || "♡"}</Text>}
        </View>
      </Reanimated.View>
    </>
  );
}

function centerOf(rect: MotionRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function defaultOrigin(): MotionRect {
  if (typeof window !== "undefined") {
    return { x: window.innerWidth / 2 - 24, y: window.innerHeight - 170, width: 48, height: 48 };
  }
  return { x: 180, y: 620, width: 48, height: 48 };
}

function defaultTarget(origin: MotionRect): MotionRect {
  if (typeof window !== "undefined") {
    return { x: window.innerWidth / 2 - 56, y: 132, width: 112, height: 58 };
  }
  return { x: origin.x, y: 120, width: 112, height: 58 };
}

const styles = StyleSheet.create({
  layer: {
    position: "fixed" as never,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
  },
  flightCapsule: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 48,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 14px 28px rgba(184,95,123,0.24)",
    elevation: 8,
  },
  flightHalfRose: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    backgroundColor: colors.accentSoft,
  },
  flightHalfCream: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    backgroundColor: colors.cream,
  },
  flightIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  flightIcon: {
    color: colors.accentDark,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  flightImage: {
    width: 21,
    height: 21,
  },
  ripple: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(215,123,150,0.42)",
    backgroundColor: "rgba(247,226,232,0.14)",
  },
  innerRipple: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    backgroundColor: "rgba(255,245,223,0.24)",
  },
});
