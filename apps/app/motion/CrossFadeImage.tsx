import { useEffect, useState } from "react";
import { Animated, StyleSheet, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";

import { BreathingSkeleton } from "@/motion/BreathingSkeleton";
import { useMotion } from "@/motion/MotionProvider";
import { motionTokens } from "@/motion/tokens";

type CrossFadeImageProps = ImageProps & {
  containerStyle?: StyleProp<ViewStyle>;
  fadeIn?: boolean;
  prefetched?: boolean;
  showSkeleton?: boolean;
};

const maxLoadedImageSourceKeys = 400;
const loadedImageSourceKeys = new Set<string>();

export function rememberLoadedImageSourceKey(sourceKey: string) {
  loadedImageSourceKeys.add(sourceKey);
  if (loadedImageSourceKeys.size <= maxLoadedImageSourceKeys) {
    return;
  }
  const oldestSourceKey = loadedImageSourceKeys.values().next().value;
  if (oldestSourceKey) {
    loadedImageSourceKeys.delete(oldestSourceKey);
  }
}

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
  fadeIn = true,
  onError,
  onLoad,
  prefetched = false,
  showSkeleton = true,
  source,
  style,
  ...props
}: CrossFadeImageProps) {
  const { reducedMotion } = useMotion();
  const sourceKey = getSourceKey(source);
  const sourceAlreadyLoaded = prefetched || (sourceKey ? loadedImageSourceKeys.has(sourceKey) : false);
  const [loaded, setLoaded] = useState(sourceAlreadyLoaded);
  const [failed, setFailed] = useState(false);
  const [opacity] = useState(() => new Animated.Value(sourceAlreadyLoaded ? 1 : 0));
  const wrapStyle = containerStyle ? containerStyle : (style as StyleProp<ViewStyle>);

  useEffect(() => {
    const sourceLoaded = prefetched || (sourceKey ? loadedImageSourceKeys.has(sourceKey) : false);
    setLoaded(sourceLoaded);
    setFailed(false);
    opacity.setValue(sourceLoaded ? 1 : 0);
  }, [opacity, prefetched, sourceKey]);

  return (
    <View style={[styles.wrap, wrapStyle]}>
      {showSkeleton && (!loaded || failed) ? <BreathingSkeleton style={StyleSheet.absoluteFill} /> : null}
      {!failed ? (
        <Animated.Image
          {...props}
          source={source}
          style={[styles.image, style, { opacity }]}
          onLoad={(event) => {
            if (sourceKey) {
              rememberLoadedImageSourceKey(sourceKey);
            }
            setLoaded(true);
            if (!fadeIn || prefetched) {
              opacity.setValue(1);
            } else {
              Animated.timing(opacity, {
                toValue: 1,
                duration: reducedMotion ? 80 : motionTokens.fadeMs,
                useNativeDriver: false,
              }).start();
            }
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
    ...StyleSheet.absoluteFill,
  },
});
