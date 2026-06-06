import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type TextInputProps,
  View,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Heart,
  HeartHandshake,
  Home,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react-native";

import { BouncyPressable } from "@/motion/BouncyPressable";
import { CrossFadeImage } from "@/motion/CrossFadeImage";
import { haptics } from "@/motion/haptics";
import { motionTokens } from "@/motion/tokens";
import { colors, shadows } from "@/styles/theme";

const brandCapsuleImage = require("@/assets/capsule-icons/brand-capsule.png") as ImageSourcePropType;

const glassDockStyle = {
  backdropFilter: "blur(16px) saturate(1.55) contrast(1.02)",
  WebkitBackdropFilter: "blur(16px) saturate(1.55) contrast(1.02)",
} as never;

export function PageContainer({ children }: { children: ReactNode }) {
  return <View style={styles.page}>{children}</View>;
}

export function AppLogo({ size = 62 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size }]}>
      <HeartHandshake color={colors.accentDark} size={size * 0.46} strokeWidth={2.2} />
    </View>
  );
}

export function CapsuleMark({
  size = 42,
  icon,
  complete = false,
}: {
  size?: number;
  icon?: ReactNode;
  complete?: boolean;
}) {
  const width = Math.round(size * 1.48);
  const height = size;
  return (
    <View
      style={[
        styles.capsuleMark,
        {
          width,
          height,
          borderRadius: height / 2,
          borderWidth: Math.max(1, Math.round(size * 0.045)),
        },
        complete ? styles.capsuleMarkComplete : null,
      ]}
    >
      <Image source={brandCapsuleImage} style={styles.capsuleMarkImage} resizeMode="stretch" />
      {icon ? <View style={styles.capsuleIconCenter}>{icon}</View> : null}
    </View>
  );
}

export function TopBar({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      {left}
      <View style={styles.topText}>
        <Text style={styles.topTitle}>{title}</Text>
        {subtitle ? <Text style={styles.topSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export type BottomTabKey = "home" | "checkins" | "calendar" | "me";

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
          style={[styles.bottomProfileTab, profileActive ? styles.bottomProfileTabActive : null, Platform.OS === "web" ? glassDockStyle : null]}
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

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(dock, document.body);
  }

  return dock;
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

export function Card({ children, soft, style }: { children: ReactNode; soft?: boolean; style?: object }) {
  return <View style={[styles.card, soft ? styles.softCard : null, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <BouncyPressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      haptic="light"
      style={styles.primaryButton}
      disabledStyle={styles.disabled}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : icon}
      <Text style={styles.primaryText}>{label}</Text>
    </BouncyPressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  danger,
  active,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <BouncyPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      haptic={active ? "selection" : "light"}
      style={[
        styles.secondaryButton,
        active ? styles.secondaryButtonActive : null,
        danger ? styles.dangerButton : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={danger || !active ? colors.accentDark : "#fff"} size="small" /> : icon}
      <Text style={[styles.secondaryText, active ? styles.secondaryTextActive : null, danger ? styles.dangerText : null]}>{label}</Text>
    </BouncyPressable>
  );
}

export function AppTextInput(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.style]} />;
}

export function CoupleAvatarGroup({
  me,
  partner,
  size = 72,
}: {
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  size?: number;
}) {
  const wrapWidth = Math.round(size * 1.33);
  const connectorWidth = Math.max(44, Math.round(size * 0.86));
  const sparkSize = Math.max(26, Math.round(size * 0.44));
  const iconSize = Math.max(13, Math.round(size * 0.2));
  return (
    <View style={styles.coupleGroup}>
      <Avatar initial={me.initial} name={me.name} imageUrl={me.avatarUrl} size={size} wrapWidth={wrapWidth} />
      <View style={[styles.coupleConnector, { width: connectorWidth, marginTop: Math.round(size * -0.28) }]}>
        <View style={styles.connectorLine} />
        <View style={[styles.coupleSpark, { width: sparkSize, height: sparkSize, borderRadius: sparkSize / 2 }]}>
          <Heart color={colors.accentDark} fill={colors.accentDark} size={iconSize} />
        </View>
        <View style={styles.connectorLine} />
      </View>
      <Avatar initial={partner.initial} name={partner.name} imageUrl={partner.avatarUrl} size={size} wrapWidth={wrapWidth} />
    </View>
  );
}

export function Avatar({
  initial,
  name,
  imageUrl,
  size = 72,
  wrapWidth = 96,
}: {
  initial: string;
  name?: string;
  imageUrl?: string | null;
  size?: number;
  wrapWidth?: number;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const borderWidth = Math.max(3, Math.round(size * 0.07));
  const innerRadius = Math.max(16, size / 2 - borderWidth);
  const shouldLoadImage = Boolean(imageUrl && imageUrl !== failedImageUrl);

  useEffect(() => {
    if (!imageUrl) {
      setFailedImageUrl(null);
      return;
    }

    setFailedImageUrl((current) => (current === imageUrl ? current : null));
  }, [imageUrl]);

  return (
    <View style={[styles.avatarWrap, { width: wrapWidth, gap: Math.max(5, Math.round(size * 0.1)) }]}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderWidth }]}>
        <View pointerEvents="none" style={[styles.avatarShine, { borderRadius: innerRadius }]} />
        <UserRound color="rgba(184,95,123,0.22)" size={Math.round(size * 0.33)} strokeWidth={2.1} />
        <Text style={[styles.avatarText, { bottom: Math.round(size * 0.17), fontSize: Math.max(13, Math.round(size * 0.21)) }]}>{initial.slice(0, 1)}</Text>
        {shouldLoadImage ? (
          <CrossFadeImage
            source={imageUrl ? { uri: imageUrl } : undefined}
            style={[styles.avatarImage, { borderRadius: innerRadius }]}
            containerStyle={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => {
              setFailedImageUrl(imageUrl!);
            }}
          />
        ) : null}
      </View>
      {name ? <Text style={styles.avatarName}>{name}</Text> : null}
    </View>
  );
}

export function MoodSelector({
  moods,
  value,
  onChange,
}: {
  moods: string[];
  value: string;
  onChange: (mood: string) => void;
}) {
  const pulseByMood = useRef(Object.fromEntries(moods.map((mood) => [mood, new Animated.Value(mood === value ? 1 : 0)]))).current;
  const popByMood = useRef(Object.fromEntries(moods.map((mood) => [mood, new Animated.Value(1)]))).current;

  useEffect(() => {
    moods.forEach((mood) => {
      Animated.spring(pulseByMood[mood], {
        toValue: mood === value ? 1 : 0,
        friction: 8,
        tension: 120,
        useNativeDriver: false,
      }).start();
    });
  }, [moods, pulseByMood, value]);

  function chooseMood(mood: string) {
    Animated.sequence([
      Animated.spring(popByMood[mood], { toValue: 1.12, friction: 4, tension: 180, useNativeDriver: false }),
      Animated.spring(popByMood[mood], { toValue: 1, friction: 5, tension: 160, useNativeDriver: false }),
    ]).start();
    onChange(mood);
  }

  return (
    <View style={styles.moodGrid}>
      {moods.map((mood) => {
        const active = mood === value;
        const moodColor = moodTone(mood);
        const activeScale = pulseByMood[mood].interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
        const scale = Animated.multiply(activeScale, popByMood[mood]);
        return (
          <Animated.View
            key={mood}
            style={[
              styles.moodChipMotion,
              {
                transform: [{ scale }],
                backgroundColor: pulseByMood[mood].interpolate({
                  inputRange: [0, 1],
                  outputRange: ["#fff", moodColor],
                }),
                borderColor: pulseByMood[mood].interpolate({
                  inputRange: [0, 1],
                  outputRange: [colors.border, moodColor],
                }),
              },
            ]}
          >
            <Pressable onPress={() => chooseMood(mood)} style={styles.moodChip}>
              <Text style={[styles.moodText, active ? styles.moodTextActive : null]}>{mood}</Text>
              {active ? <Text style={styles.moodSpark}>♡</Text> : null}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.stateBox}>
      <CapsuleMark size={48} icon={<Sparkles color={colors.accentDark} size={16} />} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{description}</Text>
    </View>
  );
}

export function LoadingState({ label = "加载中" }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={colors.accentDark} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.stateBox}>
      <CircleAlert color={colors.warning} size={24} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{description}</Text>
    </View>
  );
}

export function EventCard({ title, date, type }: { title: string; date: string; type: string }) {
  return (
    <View style={styles.eventCard}>
      <View>
        <Text style={styles.eventTitle}>{title}</Text>
        <Text style={styles.eventMeta}>{type}</Text>
      </View>
      <Text style={styles.eventDate}>{date}</Text>
    </View>
  );
}

export function CheckinCard({ author, mood, body, date, compact }: { author: string; mood?: string; body: string; date: string; compact?: boolean }) {
  return (
    <View style={[styles.checkinCard, compact ? styles.checkinCardCompact : null]}>
      <View style={styles.messageTop}>
        <Text style={styles.messageAuthor}>{author}</Text>
        <Text style={styles.eventMeta}>{date}</Text>
      </View>
      {mood ? <Text numberOfLines={compact ? 1 : undefined} style={styles.checkinMood}>{mood}</Text> : null}
      <Text numberOfLines={compact ? 3 : undefined} ellipsizeMode="tail" style={[styles.messageBody, compact ? styles.checkinBodyCompact : null]}>{body}</Text>
    </View>
  );
}

export function MessageCard({
  author,
  body,
  time,
  canDelete,
  onDelete,
}: {
  author: string;
  body: string;
  time: string;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.messageCard}>
      <View style={styles.messageTop}>
        <Text style={styles.messageAuthor}>{author}</Text>
        <Text style={styles.eventMeta}>{time}</Text>
      </View>
      <Text style={styles.messageBody}>{body}</Text>
      {canDelete ? <SecondaryButton label="删除" danger onPress={onDelete} /> : null}
    </View>
  );
}

export function InteractionButton({
  label,
  color,
  icon,
  onPress,
}: {
  label: string;
  color: string;
  icon?: ImageSourcePropType;
  onPress?: (origin?: { x: number; y: number; width: number; height: number } | null) => void;
}) {
  const buttonRef = useRef<View | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const iconLift = useRef(new Animated.Value(0)).current;

  function press() {
    Animated.parallel([
      Animated.sequence([
        Animated.spring(scale, { toValue: 0.96, friction: 7, tension: 240, useNativeDriver: false }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.spring(iconLift, { toValue: 1, friction: 4, tension: 190, useNativeDriver: false }),
        Animated.spring(iconLift, { toValue: 0, friction: 6, tension: 160, useNativeDriver: false }),
      ]),
    ]).start();
    if (!onPress) {
      return;
    }
    let called = false;
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      called = true;
      onPress({ x, y, width, height });
    });
    setTimeout(() => {
      if (!called) {
        onPress(null);
      }
    }, 40);
  }

  return (
    <Animated.View style={[styles.interactionMotion, { transform: [{ scale }] }]}>
      <BouncyPressable ref={buttonRef} onPress={press} haptic="light" style={[styles.interaction, { backgroundColor: color }]}>
        {icon ? (
          <Animated.View
            style={[
              styles.interactionIconSlot,
              {
                transform: [
                  {
                    translateY: iconLift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
                  },
                  {
                    scale: iconLift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }),
                  },
                ],
              },
            ]}
          >
            <Image source={icon} style={styles.interactionIcon} resizeMode="contain" />
          </Animated.View>
        ) : null}
        <Text style={styles.interactionText}>{label}</Text>
      </BouncyPressable>
    </Animated.View>
  );
}

export function SettingRow({ label, danger, onPress, icon }: { label: string; danger?: boolean; onPress?: () => void; icon?: ReactNode }) {
  return (
    <BouncyPressable onPress={onPress} haptic="selection" style={styles.settingRow}>
      <View style={[styles.settingIcon, danger ? styles.settingIconDanger : null]}>
        {icon ?? <Settings color={danger ? colors.accentDark : colors.blue} size={16} />}
      </View>
      <Text style={[styles.settingText, danger ? styles.dangerText : null]}>{label}</Text>
      <ChevronRight color={colors.faint} size={18} />
    </BouncyPressable>
  );
}

export function NotificationButton() {
  return (
    <View style={styles.notification}>
      <Bell color={colors.accentDark} size={18} />
    </View>
  );
}

export function FloatingEntryButton({
  label,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon: ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <BouncyPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      haptic="selection"
      style={[styles.floatingEntryButton, Platform.OS === "web" ? glassDockStyle : null]}
    >
      <View style={styles.floatingEntryIcon}>{icon}</View>
    </BouncyPressable>
  );
}

export function moodTone(mood: string) {
  if (mood.includes("甜")) return colors.moodSweet;
  if (mood.includes("难")) return colors.moodLow;
  if (mood.includes("想")) return colors.moodMiss;
  if (mood.includes("委")) return colors.moodLow;
  return colors.moodHappy;
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    gap: 16,
    paddingBottom: 52,
  },
  logo: {
    borderRadius: 26,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    ...shadows.soft,
  },
  capsuleMark: {
    position: "relative",
    overflow: "hidden",
    borderColor: "rgba(255,255,255,0.74)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 24px rgba(113, 81, 91, 0.1)",
  },
  capsuleMarkComplete: {
    boxShadow: "0 15px 28px rgba(113, 81, 91, 0.14)",
  },
  capsuleMarkImage: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
  },
  capsuleIconCenter: {
    position: "relative",
    width: "58%",
    height: "68%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.44)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  topText: {
    flex: 1,
    gap: 3,
  },
  topTitle: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
  },
  topSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
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
    bottom: "calc(2px + env(safe-area-inset-bottom))" as never,
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
    padding: 7,
    minHeight: 74,
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
    top: 7,
    bottom: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderColor: "rgba(255,255,255,0.52)",
    borderWidth: 1,
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.78), inset 0 -1px 1px rgba(93,48,60,0.05), 0 8px 18px rgba(223,79,121,0.08)",
  },
  bottomProfileTab: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    paddingVertical: 8,
    minHeight: 60,
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
  card: {
    backgroundColor: "#fff",
    borderColor: "rgba(184,95,123,0.1)",
    borderWidth: 1,
    borderRadius: 28,
    padding: 22,
    gap: 14,
    ...shadows.panel,
  },
  softCard: {
    backgroundColor: "#fff",
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    boxShadow: "0 14px 26px rgba(184, 95, 123, 0.18)",
    elevation: 3,
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondaryTextActive: {
    color: "#fff",
  },
  dangerButton: {
    backgroundColor: "#fff2f0",
    borderColor: "#eac8c2",
  },
  primaryTextBase: {
    fontWeight: "800",
  },
  secondaryText: {
    color: colors.accentDark,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  dangerText: {
    color: colors.accentDark,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.5,
  },
  input: {
    minHeight: 52,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
    outlineStyle: "none" as never,
  },
  coupleGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flexWrap: "nowrap",
  },
  avatarWrap: {
    width: 96,
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.9)",
    boxShadow: "0 12px 24px rgba(141, 116, 124, 0.13), inset 0 1px 10px rgba(184,95,123,0.06)",
    overflow: "hidden",
  },
  avatarImage: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  avatarShine: {
    position: "absolute",
    left: 4,
    right: 4,
    top: 4,
    bottom: 4,
    borderRadius: 32,
    backgroundImage: "linear-gradient(145deg, #fff 0%, #f6f1f3 54%, #f8e8ee 100%)" as never,
  },
  avatarText: {
    position: "absolute",
    bottom: 12,
    color: colors.accentDark,
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  avatarName: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  coupleConnector: {
    width: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  connectorLine: {
    flex: 1,
    height: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.16)",
  },
  coupleSpark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodChip: {
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 17,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  moodChipMotion: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  moodText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  moodTextActive: {
    color: "#fff",
  },
  moodSpark: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
  },
  stateBox: {
    minHeight: 168,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
    borderRadius: 28,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
  },
  stateTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  stateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  eventCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  eventMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  eventDate: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  messageCard: {
    gap: 9,
    padding: 15,
    borderRadius: 24,
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
  },
  checkinCard: {
    gap: 8,
    padding: 15,
    borderRadius: 24,
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderWidth: 1,
  },
  checkinCardCompact: {
    height: 132,
    justifyContent: "flex-start",
  },
  checkinMood: {
    alignSelf: "flex-start",
    color: colors.accentDark,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  messageTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  messageAuthor: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  messageBody: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  checkinBodyCompact: {
    fontSize: 14,
    lineHeight: 20,
    overflow: "hidden",
  },
  interaction: {
    width: "100%",
    height: 60,
    borderRadius: 20,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.64)",
  },
  interactionMotion: {
    width: "23%",
    flexGrow: 0,
    flexShrink: 0,
  },
  interactionIconSlot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  interactionIcon: {
    width: 22,
    height: 22,
  },
  interactionText: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 16,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  settingIconDanger: {
    backgroundColor: colors.accentSoft,
  },
  settingText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  notification: {
    width: 42,
    height: 42,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingEntryButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.16)",
    boxShadow: "0 16px 34px rgba(99, 74, 83, 0.16)",
    elevation: 4,
  },
  floatingEntryButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  floatingEntryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247, 226, 232, 0.9)",
  },
});
