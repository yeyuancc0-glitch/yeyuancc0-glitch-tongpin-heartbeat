import { forwardRef, useMemo, useState } from "react";
import { Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type View, type ViewStyle } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { haptics, type HapticTone } from "@/motion/haptics";
import { useMotion } from "@/motion/MotionProvider";
import { motionTokens } from "@/motion/tokens";

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type PressableStyle = PressableProps["style"];

export type BouncyPressableProps = Omit<PressableProps, "style"> & {
  style?: PressableStyle;
  scaleTo?: number;
  haptic?: HapticTone;
  disabledStyle?: StyleProp<ViewStyle>;
};

export const BouncyPressable = forwardRef<View, BouncyPressableProps>(function BouncyPressable(
  {
    children,
    disabled,
    disabledStyle,
    haptic = "light",
    onPressIn,
    onPressOut,
    scaleTo = motionTokens.pressScale,
    style,
    ...props
  },
  ref,
) {
  const { reducedMotion } = useMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const [pressed, setPressed] = useState(false);
  const resolvedStyle = useMemo(() => {
    const state = { pressed, hovered: false } as PressableStateCallbackType;
    return typeof style === "function" ? style(state) : style;
  }, [pressed, style]);

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        if (!disabled) {
          haptics.play(haptic);
          if (!reducedMotion) {
            scale.value = withTiming(scaleTo, { duration: 80 });
          }
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        if (!disabled && !reducedMotion) {
          scale.value = withSpring(1, motionTokens.spring.press);
        }
        onPressOut?.(event);
      }}
      style={[resolvedStyle, disabled ? disabledStyle : null, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
