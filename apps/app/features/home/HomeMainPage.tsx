import { useEffect, useRef, useState } from "react";
import { Animated, Image, Text, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { Heart, Sparkles } from "lucide-react-native";

import {
  AppTextInput,
  Card,
  CapsuleMark,
  CoupleAvatarGroup,
  InteractionButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/app-ui/AppUI";
import { InlineNotice } from "@/components/ui";
import { splitStory } from "@/features/checkins/checkinUtils";
import type { PhotoFileList, PhotoUploadOptions, PhotoUploadResult, QuickInteractionItem } from "@/features/home/homeShared";
import { styles } from "@/features/home/homeStyles";
import { floatingIconForInteraction, interactionIconFor } from "@/features/home/homeUtils";
import { petAnchorProps } from "@/features/home/petDomProps";
import { PhotoAlbumCard } from "@/features/media/PhotoAlbum";
import { HomeMessageBoard } from "@/features/messages/MessagePages";
import { formatShortDate, todayIsoDate } from "@/lib/dates/date";
import type { Checkin, MediaFile, Message, MoodStatus } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { haptics } from "@/motion/haptics";
import { useMotion, type MotionRect } from "@/motion/MotionProvider";
import { colors } from "@/styles/theme";

export function HomeMainPage({
  me,
  partner,
  startedAt,
  loveDays,
  coupleId,
  coupleReady,
  checkins,
  messages,
  currentUserId,
  quickInteractions,
  todayInteractionCount,
  onAddCustomQuickInteraction,
  customQuickComposerOpen,
  customQuickDraft,
  onChangeCustomQuickDraft,
  onSaveCustomQuickInteraction,
  onCancelCustomQuickInteraction,
  onQuickInteraction,
  onWriteLetter,
  onUploadPhoto,
  onPhotoFiles,
  onPreviewPhoto,
  onDeletePhoto,
  onChanged,
  onOpenMessages,
  onRequireAccess,
  interactionText,
  quickSending,
  mediaFiles,
  moodStatuses,
}: {
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  startedAt: string;
  loveDays: number;
  coupleId: string;
  coupleReady: boolean;
  checkins: Checkin[];
  messages: Message[];
  currentUserId: string;
  quickInteractions: QuickInteractionItem[];
  todayInteractionCount: number;
  onAddCustomQuickInteraction: () => void;
  customQuickComposerOpen: boolean;
  customQuickDraft: string;
  onChangeCustomQuickDraft: (value: string) => void;
  onSaveCustomQuickInteraction: () => void;
  onCancelCustomQuickInteraction: () => void;
  onQuickInteraction: (label: string) => Promise<boolean> | boolean;
  onWriteLetter: () => void;
  onUploadPhoto: (options?: PhotoUploadOptions) => void;
  onPhotoFiles: (files: PhotoFileList, options?: PhotoUploadOptions) => Promise<PhotoUploadResult>;
  onPreviewPhoto: (file: MediaFile, index?: number) => void;
  onDeletePhoto: (file: MediaFile) => void;
  onChanged: () => void;
  onOpenMessages: () => void;
  onRequireAccess: () => void;
  interactionText: string;
  quickSending: boolean;
  mediaFiles: MediaFile[];
  moodStatuses: MoodStatus[];
}) {
  const { playQuickInteractionFlight } = useMotion();
  const [reaction, setReaction] = useState<{ id: number; label: string; icon: string; image?: ImageSourcePropType } | null>(null);
  const quickTargetRef = useRef<View | null>(null);
  const quickTargetRectRef = useRef<MotionRect | null>(null);
  const today = todayIsoDate();
  const todayStories = checkins.filter((item) => item.checkin_date === today);
  const latestStory = todayStories[0] ? splitStory(todayStories[0].content) : null;
  const todayCapsuleStatus = latestStory ? latestStory.mood || "已存下" : "还空着";
  const latestMessage = messages[0]?.body || "";
  const myMood = moodStatuses.find((item) => item.user_id === currentUserId);
  const partnerMood = moodStatuses.find((item) => item.user_id !== currentUserId);

  function measureQuickTarget() {
    quickTargetRef.current?.measureInWindow((x, y, width, height) => {
      const rect = { x, y, width, height };
      quickTargetRectRef.current = rect;
    });
  }

  async function sendQuickInteraction(label: string, icon: string, image?: ImageSourcePropType, origin?: MotionRect | null) {
    const delivered = await onQuickInteraction(label);
    if (!delivered) {
      haptics.error();
      setReaction(null);
      return;
    }
    const target = quickTargetRectRef.current;
    setReaction({ id: Date.now(), label, icon, image });
    playQuickInteractionFlight({ label, icon, image, origin, target });
  }

  return (
    <View style={styles.stack}>
      <Card soft style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.brandRow}>
            <CapsuleMark size={44} icon={<Sparkles color={colors.accentDark} size={14} />} />
            <View>
              <Text style={styles.heroBrand}>同频跳动</Text>
              <Text style={styles.heroBrandSub}>一段只属于两个人的日常</Text>
            </View>
          </View>
        </View>
        <View
          ref={quickTargetRef}
          collapsable={false}
          onLayout={measureQuickTarget}
          {...petAnchorProps("home-love-days", "love-days")}
          style={styles.heroLovePanel}
        >
          <View style={styles.heroAvatarPair}>
            <CoupleAvatarGroup me={me} partner={partner} size={54} />
          </View>
          <View style={styles.heroLoveBody}>
            <Text style={styles.heroLoveTitle}>恋爱第</Text>
            <View style={styles.heroNumberRow}>
              <Text style={styles.heroLoveNumber}>{loveDays}</Text>
              <Text style={styles.heroLoveUnit}>天</Text>
            </View>
            <Text style={styles.startedText}>{startedAt ? `从 ${formatShortDate(startedAt)} 开始` : "从今天开始"}</Text>
          </View>
          <Svg pointerEvents="none" width="100%" height="66" viewBox="0 0 280 66" style={styles.heroWave}>
            <Defs>
              <LinearGradient id="heartbeatStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#f6bfd0" />
                <Stop offset="46%" stopColor="#d9a5e6" />
                <Stop offset="100%" stopColor="#f7c6d7" />
              </LinearGradient>
            </Defs>
            <Path
              d="M16 33 L50 33 L66 18 L81 48 L96 33 L122 33 L140 23 L156 42 L170 33 L194 33 L206 26 L218 40 L230 33 L264 33"
              stroke="url(#heartbeatStroke)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
          <LoveLetterEntryCard partnerName={partner.name} onPress={coupleReady ? onWriteLetter : onRequireAccess} />
        </View>
      </Card>

      <View {...petAnchorProps("home-quick-sync", "quick-sync")}>
        <Card style={styles.moodStatusCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>此刻同频</Text>
            <View style={styles.interactionCountPill}>
              <Heart color={colors.accentDark} size={13} fill={todayInteractionCount ? colors.accentDark : "transparent"} />
              <Text style={styles.interactionCountText}>今日 {todayInteractionCount} 次</Text>
            </View>
          </View>
          <View style={styles.statusGrid}>
            <BubbleMoodSlot label="我的心情" value={myMood?.mood || todayCapsuleStatus} active tone="warm" />
            <BubbleMoodSlot label="TA 的心情" value={partnerMood?.mood || "等一封回应"} tone="cool" />
          </View>
          <View style={styles.interactionGrid}>
            {quickInteractions.map((item) => (
              <InteractionButton
                key={item.id}
                label={item.label}
                color={item.tone}
                icon={item.icon ?? interactionIconFor(item.id)}
                onPress={coupleReady ? (item.id === "message" ? onAddCustomQuickInteraction : quickSending ? undefined : (origin) => void sendQuickInteraction(item.label, floatingIconForInteraction(item.id), item.icon ?? interactionIconFor(item.id), origin)) : onRequireAccess}
              />
            ))}
          </View>
          {customQuickComposerOpen ? (
            <View style={styles.customQuickComposer}>
              <AppTextInput
                value={customQuickDraft}
                onChangeText={onChangeCustomQuickDraft}
                placeholder="写一个快捷互动"
                maxLength={8}
                style={styles.customQuickInput}
              />
              <View style={styles.customQuickActions}>
                <SecondaryButton label="取消" onPress={onCancelCustomQuickInteraction} />
                <PrimaryButton label="保存" onPress={onSaveCustomQuickInteraction} disabled={!customQuickDraft.trim()} />
              </View>
            </View>
          ) : null}
          {reaction ? <FloatingReaction key={reaction.id} icon={reaction.icon} label={reaction.label} image={reaction.image} /> : null}
          {interactionText ? <InlineNotice tone="success">{interactionText}</InlineNotice> : null}
        </Card>
      </View>

      <HomeMessageBoard
        coupleId={coupleId}
        messages={messages}
        currentUserId={currentUserId}
        latestMessage={latestMessage}
        onChanged={onChanged}
        onOpenAll={onOpenMessages}
        onRequireAccess={onRequireAccess}
      />

      <PhotoAlbumCard mediaFiles={mediaFiles} onUploadPhoto={onUploadPhoto} onPhotoFiles={onPhotoFiles} onPreviewPhoto={onPreviewPhoto} onDeletePhoto={onDeletePhoto} onRequireAccess={onRequireAccess} />
    </View>
  );
}

function LoveLetterEntryCard({ partnerName, onPress }: { partnerName: string; onPress: () => void }) {
  return (
    <BouncyPressable {...petAnchorProps("home-love-letter", "love-letter")} accessibilityRole="button" accessibilityLabel={`给 ${partnerName} 写一封情书`} haptic="selection" onPress={onPress} style={styles.loveLetterEntryCard}>
      <View pointerEvents="none" style={styles.envelopeFlap} />
      <View pointerEvents="none" style={styles.envelopeLeftFold} />
      <View pointerEvents="none" style={styles.envelopeRightFold} />
      <View style={styles.envelopeSeal}>
        <View style={styles.envelopeSealInner}>
          <Heart color="#fff" size={11} fill="#fff" strokeWidth={2.5} />
        </View>
      </View>
      <Text style={styles.loveLetterEntryTitle}>写一封信</Text>
      <Text style={styles.loveLetterEntryText}>给 {partnerName} 留一张慢慢展开的信纸</Text>
    </BouncyPressable>
  );
}

function BubbleMoodSlot({
  label,
  value,
  active,
  tone,
}: {
  label: string;
  value: string;
  active?: boolean;
  tone: "warm" | "cool";
}) {
  return (
    <View style={[styles.bubbleMoodSlot, tone === "warm" ? styles.bubbleMoodSlotWarm : styles.bubbleMoodSlotCool, active ? styles.bubbleMoodSlotActive : null]}>
      <View pointerEvents="none" style={styles.bubbleMoodLobeOne} />
      <View pointerEvents="none" style={styles.bubbleMoodLobeTwo} />
      <View pointerEvents="none" style={styles.bubbleMoodLobeThree} />
      <View style={styles.bubbleMoodIcon}>
        <Sparkles color={tone === "warm" ? "#d47c9b" : "#8a7fc2"} size={14} strokeWidth={2.4} />
      </View>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function FloatingReaction({ icon, label, image }: { icon: string; label: string; image?: ImageSourcePropType }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 1250, useNativeDriver: false }).start();
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: false }),
      ]),
      { iterations: 2 }
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [progress, pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingReaction,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [12, -18, -22] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0.9, 1.02, 0.98] }) },
          ],
        },
      ]}
    >
      <View style={styles.floatingReactionIconWrap}>
        {image ? <Image source={image} style={styles.floatingReactionImage} resizeMode="contain" /> : <Text style={styles.floatingReactionIcon}>{icon}</Text>}
      </View>
      <View style={styles.floatingReactionCopy}>
        <Text style={styles.floatingReactionTitle}>正把心意送到 TA 身边</Text>
        <Text style={styles.floatingReactionText}>{label}</Text>
        <View style={styles.floatingReactionTrack}>
          <Animated.View
            style={[
              styles.floatingReactionTrackFill,
              {
                width: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: ["10%", "88%", "100%"] }),
              },
            ]}
          />
        </View>
      </View>
      <View style={styles.floatingReactionDots}>
        {[0, 1, 2].map((item) => (
          <Animated.View
            key={item}
            style={[
              styles.floatingReactionDot,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [item === 0 ? 1 : 0.42, item === 2 ? 1 : 0.42] }),
                transform: [
                  {
                    translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, item === 1 ? -3 : 0] }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
}
