import { useEffect, useState } from "react";
import { Animated, Image, StyleSheet, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";

import { BreathingSkeleton } from "@/motion/BreathingSkeleton";
import { useMotion } from "@/motion/MotionProvider";
import { motionTokens } from "@/motion/tokens";

type CrossFadeImageProps = ImageProps & {
  containerStyle?: StyleProp<ViewStyle>;
  showSkeleton?: boolean;
};

function getSourceKey(source: ImageProps["source"]): string {
  if (!source) {
    return "";
  }
  if (typeof source === "number") {
    return `asset:${source}`;
  }
  if (Array.isArray(source)) {
    return source.map(getSourceKey).join("|");
  }
  return source.uri ?? "";
}

export function CrossFadeImage({
  containerStyle,
  onError,
  onLoad,
  showSkeleton = true,
  source,
  style,
  ...props
}: CrossFadeImageProps) {
  const { reducedMotion } = useMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));
  const sourceKey = getSourceKey(source);
  const wrapStyle = containerStyle ? containerStyle : (style as StyleProp<ViewStyle>);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    opacity.setValue(0);
  }, [opacity, sourceKey]);

  return (
    <View style={[styles.wrap, wrapStyle]}>
      {showSkeleton && !loaded && !failed ? <BreathingSkeleton style={StyleSheet.absoluteFill} /> : null}
      {!failed ? (
        <Animated.Image
          {...props}
          source={source}
          style={[styles.image, style, { opacity }]}
          onLoad={(event) => {
            setLoaded(true);
            Animated.timing(opacity, {
              toValue: 1,
              duration: reducedMotion ? 80 : motionTokens.fadeMs,
              useNativeDriver: false,
            }).start();
            onLoad?.(event);
          }}
          onError={(event) => {
            setFailed(true);
            onError?.(event);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
});
