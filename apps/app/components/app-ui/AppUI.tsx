import { useEffect, useRef, useState, type ReactNode } from "react";
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
  type TextInputProps,
  View,
} from "react-native";
import {
  Bell,
  ChevronRight,
  CircleAlert,
  Heart,
  HeartHandshake,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react-native";

import { BouncyPressable } from "@/motion/BouncyPressable";
import { CrossFadeImage } from "@/motion/CrossFadeImage";
import { styles } from "@/components/app-ui/AppUI.styles";
import { colors } from "@/styles/theme";

export { BottomTabBar, type BottomTabKey } from "@/components/app-ui/BottomTabBar";

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
            fadeIn={false}
            prefetched
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

export function EmptyState({ title, description }: { title: string; description?: string | null }) {
  return (
    <View style={styles.stateBox}>
      <CapsuleMark size={48} icon={<Sparkles color={colors.accentDark} size={16} />} />
      <Text style={styles.stateTitle}>{title}</Text>
      {description ? <Text style={styles.stateText}>{description}</Text> : null}
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
