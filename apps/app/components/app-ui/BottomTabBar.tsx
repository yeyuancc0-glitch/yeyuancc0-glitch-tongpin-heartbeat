import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { CalendarDays, Home, Sparkles, UserRound } from "lucide-react-native";

import { BouncyPressable } from "@/motion/BouncyPressable";
import { renderPortal } from "@/lib/platform/portal";
import { haptics } from "@/motion/haptics";
import { motionTokens } from "@/motion/tokens";
import { colors } from "@/styles/theme";

export type BottomTabKey = "home" | "checkins" | "calendar" | "me";

const glassDockStyle = {
  backdropFilter: "blur(16px) saturate(1.55) contrast(1.02)",
  WebkitBackdropFilter: "blur(16px) saturate(1.55) contrast(1.02)",
} as never;

export function BottomTabBar({
  activeTab,
  onChange,
}: {
  activeTab: BottomTabKey;
  onChange: (tab: BottomTabKey) => void;
}) {
  const items: Array<{ key: BottomTabKey; label: string; Icon: typeof Home }> = [
    { key: "home", label: "首页", Icon: Home },
    { key: "checkins", label: "分享", Icon: Sparkles },
    { key: "calendar", label: "记忆", Icon: CalendarDays },
    { key: "me", label: "我的", Icon: UserRound },
  ];
  const mainItems = items.filter((item) => item.key !== "me");
  const profileItem = items.find((item) => item.key === "me")!;
  const ProfileIcon = profileItem.Icon;
  const profileActive = profileItem.key === activeTab;
  const activeMainIndex = Math.max(0, mainItems.findIndex((item) => item.key === activeTab));
  const [tabTrackWidth, setTabTrackWidth] = useState(0);
  const tabSlotWidth = tabTrackWidth > 0 ? (tabTrackWidth - 14 - (mainItems.length - 1) * 3) / mainItems.length : 0;
  const indicatorX = useSharedValue(activeMainIndex);
  const profileScale = useSharedValue(1);

  useEffect(() => {
    indicatorX.value = withSpring(activeMainIndex, motionTokens.spring.tab);
  }, [activeMainIndex, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: activeTab === "me" || !tabSlotWidth ? 0 : 1,
    width: tabSlotWidth,
    transform: [{ translateX: 7 + indicatorX.value * (tabSlotWidth + 3) }],
  }));

  const profileMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: profileScale.value }],
  }));

  function changeTab(tab: BottomTabKey) {
    if (tab === activeTab) {
      return;
    }
    haptics.selection();
    onChange(tab);
  }

  function onTabTrackLayout(event: LayoutChangeEvent) {
    setTabTrackWidth(event.nativeEvent.layout.width);
  }

  const dock = (
    <View style={[styles.bottomTabsDock, Platform.OS === "web" ? styles.bottomTabsDockWeb : null]}>
      <View style={styles.bottomTabsRow}>
        <View style={[styles.bottomTabs, Platform.OS === "web" ? glassDockStyle : null]} onLayout={onTabTrackLayout}>
          <View pointerEvents="none" style={styles.bottomGlassWash} />
          <View pointerEvents="none" style={styles.bottomGlassTopSheen} />
          <View pointerEvents="none" style={styles.bottomGlassBottomShade} />
          <Reanimated.View pointerEvents="none" style={[styles.bottomTabLiquidIndicator, indicatorStyle]}>
            <View pointerEvents="none" style={styles.bottomTabActivePrism} />
            <View pointerEvents="none" style={styles.bottomTabActiveSheen} />
          </Reanimated.View>
          {mainItems.map((item) => {
            const active = item.key === activeTab;
            const iconColor = active ? colors.accentDark : "rgba(42,36,38,0.78)";
            const Icon = item.Icon;
            return (
              <BottomTabItem
                key={item.key}
                active={active}
                iconColor={iconColor}
                label={item.label}
                Icon={Icon}
                onPress={() => changeTab(item.key)}
              />
            );
          })}
        </View>
        <Reanimated.View style={profileMotionStyle}>
          <BouncyPressable
            accessibilityRole="tab"
            accessibilityLabel={profileItem.label}
            accessibilityState={{ selected: profileActive }}
            haptic="selection"
            scaleTo={motionTokens.iconPressScale}
            onPress={() => changeTab(profileItem.key)}
            onPressIn={() => {
              profileScale.value = withTiming(motionTokens.iconPressScale, { duration: 80 });
            }}
            onPressOut={() => {
              profileScale.value = withSpring(1, motionTokens.spring.press);
            }}
            style={[
              styles.bottomProfileTab,
              profileActive ? styles.bottomProfileTabActive : null,
              Platform.OS === "web" ? glassDockStyle : null,
            ]}
          >
            <View pointerEvents="none" style={styles.bottomProfileGlassWash} />
            <View pointerEvents="none" style={styles.bottomProfileTopSheen} />
            {profileActive ? <View pointerEvents="none" style={styles.bottomProfileHalo} /> : null}
            <ProfileIcon color={profileActive ? colors.accentDark : "rgba(42,36,38,0.78)"} size={28} strokeWidth={profileActive ? 2.55 : 2.25} />
          </BouncyPressable>
        </Reanimated.View>
      </View>
    </View>
  );

  return renderPortal(dock);
}

function BottomTabItem({
  active,
  iconColor,
  label,
  Icon,
  onPress,
}: {
  active: boolean;
  iconColor: string;
  label: string;
  Icon: typeof Home;
  onPress: () => void;
}) {
  const iconScale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      iconScale.value = withSequence(
        withTiming(motionTokens.iconPressScale, { duration: 70 }),
        withSpring(motionTokens.iconPopScale, motionTokens.spring.press),
        withSpring(1, motionTokens.spring.tab),
      );
    }
  }, [active, iconScale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: active ? -1 : 0 },
      { scale: iconScale.value },
    ],
  }));

  return (
    <BouncyPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      haptic="selection"
      scaleTo={motionTokens.iconPressScale}
      onPress={onPress}
      style={[styles.bottomTab, active ? styles.bottomTabActive : null]}
    >
      <Reanimated.View style={[styles.bottomTabIconSlot, iconStyle]}>
        <Icon color={iconColor} size={22} strokeWidth={active ? 2.5 : 2.25} />
      </Reanimated.View>
      <Text style={[styles.bottomTabText, active ? styles.bottomTabTextActive : null]}>{label}</Text>
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  bottomTabsDock: {
    position: "fixed" as never,
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 10,
  },
  bottomTabsDockWeb: {
    bottom: "max(18px, calc(env(safe-area-inset-bottom) - 8px))" as never,
  },
  bottomTabsRow: {
    width: "96%",
    maxWidth: 448,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.48))" as never,
  },
  bottomTabs: {
    flex: 1,
    flexDirection: "row",
    gap: 3,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.28)",
    borderColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderRadius: 999,
    padding: 5,
    minHeight: 66,
    boxShadow: "0 22px 52px rgba(67, 44, 53, 0.18), 0 8px 20px rgba(255,255,255,0.24), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(74,44,52,0.07)",
    elevation: 8,
  },
  bottomGlassWash: {
    position: "absolute",
    left: 3,
    right: 3,
    top: 3,
    bottom: 3,
    borderRadius: 999,
    backgroundImage: "radial-gradient(circle at 16% 12%, rgba(255,255,255,0.72), rgba(255,255,255,0.18) 34%, rgba(255,255,255,0.08) 62%), radial-gradient(circle at 20% 58%, rgba(255,204,224,0.34), rgba(199,225,255,0.18) 28%, rgba(255,255,255,0) 52%), linear-gradient(145deg, rgba(255,255,255,0.38), rgba(255,255,255,0.12) 52%, rgba(255,255,255,0.26))" as never,
  },
  bottomGlassTopSheen: {
    position: "absolute",
    left: 16,
    right: 18,
    top: 6,
    height: 22,
    borderRadius: 999,
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0))" as never,
    opacity: 0.72,
  },
  bottomGlassBottomShade: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 3,
    height: 18,
    borderRadius: 999,
    backgroundImage: "linear-gradient(0deg, rgba(72,43,52,0.1), rgba(72,43,52,0))" as never,
    opacity: 0.34,
  },
  bottomTabLiquidIndicator: {
    position: "absolute",
    left: 0,
    top: 5,
    bottom: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderColor: "rgba(255,255,255,0.52)",
    borderWidth: 1,
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.78), inset 0 -1px 1px rgba(93,48,60,0.05), 0 8px 18px rgba(223,79,121,0.08)",
  },
  bottomProfileTab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.34)",
    borderColor: "rgba(255,255,255,0.68)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 22px 52px rgba(67, 44, 53, 0.2), 0 8px 20px rgba(255,255,255,0.26), inset 0 1px 1px rgba(255,255,255,0.92), inset 0 -1px 1px rgba(74,44,52,0.07)",
    elevation: 8,
  },
  bottomProfileTabActive: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.78)",
  },
  bottomProfileGlassWash: {
    position: "absolute",
    left: 3,
    right: 3,
    top: 3,
    bottom: 3,
    borderRadius: 999,
    backgroundImage: "radial-gradient(circle at 34% 18%, rgba(255,255,255,0.78), rgba(255,255,255,0.18) 48%, rgba(255,255,255,0.32) 100%), radial-gradient(circle at 18% 58%, rgba(255,211,226,0.24), rgba(205,231,255,0.16) 36%, rgba(255,255,255,0) 62%)" as never,
  },
  bottomProfileTopSheen: {
    position: "absolute",
    top: 8,
    left: 18,
    right: 18,
    height: 15,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.68)",
    opacity: 0.76,
  },
  bottomProfileHalo: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
    borderRadius: 999,
    backgroundColor: "rgba(247,226,232,0.52)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
    paddingVertical: 5,
    minHeight: 54,
    zIndex: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0)",
  },
  bottomTabActive: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: "rgba(255,255,255,0)",
  },
  bottomTabActivePrism: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundImage: "radial-gradient(circle at 16% 32%, rgba(255,217,235,0.74), rgba(201,231,255,0.32) 29%, rgba(255,255,255,0.16) 54%, rgba(255,255,255,0.04) 100%), linear-gradient(100deg, rgba(255,255,255,0.62), rgba(255,255,255,0.18) 48%, rgba(255,255,255,0.1))" as never,
  },
  bottomTabActiveSheen: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 5,
    height: 18,
    borderRadius: 999,
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0))" as never,
    opacity: 0.72,
  },
  bottomTabText: {
    color: "rgba(42,36,38,0.84)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "850" as never,
    textAlign: "center",
  },
  bottomTabTextActive: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  bottomTabIconSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
