import { useState } from "react";
import { Image, Platform, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import { CalendarPlus, Heart, ImagePlus, Mail, MessageCircle, Sparkles, Trash2 } from "lucide-react-native";

import { Card, CapsuleMark, EmptyState } from "@/components/app-ui/AppUI";
import { useAppScrollY, useToast } from "@/components/ui";
import { checkinPhotoCaption, splitStory, storyIconImageFromText } from "@/features/checkins/checkinUtils";
import { cartoonIcons, capsuleIcons } from "@/features/home/homeAssets";
import { styles } from "@/features/home/homeStyles";
import { petAnchorProps, petSafeActionProps } from "@/features/home/petDomProps";
import type { PhotoFileList, PhotoUploadResult } from "@/features/home/homeShared";
import { formatMemoryDate, maxMemoryPhotos, type MemoryFilter, type MemoryTimelineItem } from "@/features/memory/memoryUtils";
import { PhotoUploadInput } from "@/features/media/PhotoUploadInput";
import { imagePreviewUrl, isCheckinPhotoCaption } from "@/features/media/mediaUtils";
import { renderPortal } from "@/lib/platform/portal";
import type { CalendarEvent, Checkin, CoupleFootprint, CreationSpace, LetterPreview, MediaFile, Message } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { BreathingSkeleton } from "@/motion/BreathingSkeleton";
import { CrossFadeImage } from "@/motion/CrossFadeImage";
import { colors } from "@/styles/theme";

type PetWorldDecisionProp = "photo" | "memory" | "letter" | "none" | null;
type MemoryPhotoUploadRequest = {
  files?: PhotoFileList;
  memory: MemoryTimelineItem;
  currentCount: number;
};

export function MemoryPage({
  checkins,
  messages,
  events,
  mediaFiles,
  letters,
  footprints,
  creationSpace,
  petWorldProp,
  currentUserId,
  onAddEvent,
  onOpenLetter,
  onChanged,
  onUploadMemoryPhoto,
  onPreviewMemoryPhoto,
  onCreateCapsule,
  onDeleteCheckin,
  onDeleteCalendarEvent,
  onDeleteMedia,
  onDeleteFootprint,
  onDeleteLetter,
}: {
  checkins: Checkin[];
  messages: Message[];
  events: CalendarEvent[];
  mediaFiles: MediaFile[];
  letters: LetterPreview[];
  footprints: CoupleFootprint[];
  creationSpace: CreationSpace | null;
  petWorldProp: PetWorldDecisionProp;
  currentUserId: string;
  onAddEvent: () => void;
  onOpenLetter: (letter: LetterPreview) => void;
  onChanged: () => void;
  onUploadMemoryPhoto: (request: MemoryPhotoUploadRequest) => Promise<PhotoUploadResult> | void;
  onPreviewMemoryPhoto: (file: MediaFile, index: number) => void;
  onCreateCapsule: () => void;
  onDeleteCheckin?: (checkinId: string) => Promise<void>;
  onDeleteCalendarEvent?: (eventId: string) => Promise<void>;
  onDeleteMedia?: (file: MediaFile) => Promise<void>;
  onDeleteFootprint?: (footprintId: string) => Promise<void>;
  onDeleteLetter?: (letterId: string) => Promise<void>;
}) {
  const memories = buildMemoryTimeline(checkins, messages, events, mediaFiles, letters, footprints, currentUserId);
  const [filter, setFilter] = useState<MemoryFilter>("全部");
  const visibleMemories = filter === "全部" ? memories : memories.filter((memory) => memory.filter === filter);
  const filterOptions: MemoryFilter[] = ["全部", "日常", "留言", "纪念日", "信件"];
  const petInspectingMemory = creationSpace?.pet_world_surface === "memory" && (petWorldProp === "photo" || petWorldProp === "memory");
  return (
    <View style={styles.memoryScreen}>
      <View {...petAnchorProps("memory-hero", "memory-hero")} style={styles.memoryHero}>
        <View pointerEvents="none" style={styles.memoryHeroGlow} />
        <View style={styles.memoryHeroTitleRow}>
          <View style={styles.memoryHeroMark}>
            <CapsuleMark size={34} complete />
          </View>
          <View style={styles.memoryHeroCopy}>
            <Text style={styles.memoryHeroTitle}>记忆风铃</Text>
            <Text style={styles.memorySubtitle}>把那些小小的瞬间，慢慢存起来。</Text>
          </View>
        </View>
        <View style={styles.memoryHeroChimes}>
          <View style={[styles.memoryHeroChime, styles.memoryHeroChimeRose]} />
          <View style={[styles.memoryHeroChime, styles.memoryHeroChimeCream]} />
          <View style={[styles.memoryHeroChime, styles.memoryHeroChimeViolet]} />
        </View>
      </View>
      <View {...petAnchorProps("memory-calendar", "memory-calendar")}>
      <Card style={styles.memoryCalendarCard}>
        <View pointerEvents="none" style={styles.memoryCalendarWash} />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>我们的日历</Text>
          <Image source={cartoonIcons.calendar} style={styles.headerIcon} resizeMode="contain" />
        </View>
        <MiniCalendar checkins={checkins} messages={messages} events={events} letters={letters} />
      </Card>
      </View>
      <View style={styles.memoryFilterRow}>
        {filterOptions.map((option) => (
          <Pressable {...petSafeActionProps()} key={option} accessibilityRole="button" accessibilityLabel={`筛选${option}记忆`} onPress={() => setFilter(option)} style={[styles.memoryFilterChip, filter === option ? styles.memoryFilterChipActive : null]}>
            <Text style={[styles.memoryFilterText, filter === option ? styles.memoryFilterTextActive : null]}>{option}</Text>
          </Pressable>
        ))}
      </View>
      {petInspectingMemory ? <PetMemoryCueCard prop={petWorldProp} /> : null}
      <View style={styles.memoryTimeline}>
        {visibleMemories.length ? (
          visibleMemories.map((memory, index) => (
            <MemoryTimelineCard
              key={memory.id}
              memory={memory}
              index={index}
              isLast={index === visibleMemories.length - 1}
              onPress={memory.letter ? () => onOpenLetter(memory.letter!) : undefined}
              onUploadPhoto={(files) => onUploadMemoryPhoto({ files, memory, currentCount: memory.photos.length })}
              onPreviewPhoto={(file, photoIndex) => onPreviewMemoryPhoto(file, photoIndex)}
              onDeleted={onChanged}
              onDeleteCheckin={onDeleteCheckin}
              onDeleteCalendarEvent={onDeleteCalendarEvent}
              onDeleteMedia={onDeleteMedia}
              onDeleteFootprint={onDeleteFootprint}
              onDeleteLetter={onDeleteLetter}
            />
          ))
        ) : (
          <Pressable {...petSafeActionProps()} accessibilityRole="button" accessibilityLabel="创建今日胶囊" onPress={onCreateCapsule} style={styles.emptyStatePressable}>
            <EmptyState title="这个分类还没有胶囊" description="点一下先创建今天的胶囊，新的日常会出现在这里。" />
          </Pressable>
        )}
      </View>
      <FloatingMemoryAction onAddEvent={onAddEvent} />
    </View>
  );
}

function PetMemoryCueCard({ prop }: { prop: "photo" | "memory" | "letter" | "none" | null }) {
  const isPhoto = prop === "photo";
  return (
    <View {...petAnchorProps("memory-pet-cue", "memory-pet-cue")}>
      <Card style={styles.petMemoryCueCard}>
        <View pointerEvents="none" style={styles.petMemoryCueGlow} />
        <View style={styles.petMemoryCueIcon}>
          <ImagePlus color={colors.accentDark} size={22} strokeWidth={2.45} />
        </View>
        <View style={styles.petMemoryCueCopy}>
          <Text style={styles.petMemoryCueTitle}>{isPhoto ? "云宠在照片旁停下了" : "云宠在记忆页慢慢看"}</Text>
          <Text style={styles.petMemoryCueText}>{isPhoto ? "轻轻咕噜了一声。" : "轻轻咕噜了一声。"}</Text>
        </View>
      </Card>
    </View>
  );
}

function FloatingMemoryAction({
  onAddEvent,
}: {
  onAddEvent: () => void;
}) {
  const button = (
    <View style={styles.memoryActionDock}>
      <Pressable {...petSafeActionProps()} accessibilityRole="button" accessibilityLabel="添加记忆" onPress={onAddEvent} style={styles.memoryActionMini}>
        <CalendarPlus color={colors.accentDark} size={20} strokeWidth={2.4} />
      </Pressable>
    </View>
  );

  return renderPortal(button);
}

function MemoryTimelineCard({
  memory,
  index,
  isLast,
  onPress,
  onUploadPhoto,
  onPreviewPhoto,
  onDeleted,
  onDeleteCheckin,
  onDeleteCalendarEvent,
  onDeleteMedia,
  onDeleteFootprint,
  onDeleteLetter,
}: {
  memory: MemoryTimelineItem;
  index: number;
  isLast: boolean;
  onPress?: () => void;
  onUploadPhoto: (files?: FileList) => void;
  onPreviewPhoto: (file: MediaFile, index: number) => void;
  onDeleted: () => void;
  onDeleteCheckin?: (checkinId: string) => Promise<void>;
  onDeleteCalendarEvent?: (eventId: string) => Promise<void>;
  onDeleteMedia?: (file: MediaFile) => Promise<void>;
  onDeleteFootprint?: (footprintId: string) => Promise<void>;
  onDeleteLetter?: (letterId: string) => Promise<void>;
}) {
  const scrollY = useAppScrollY();
  const { showToast } = useToast();
  const focusDistance = Math.abs(scrollY - (178 + index * 156));
  const focus = Math.max(0, 1 - focusDistance / 210);
  const Container = onPress ? Pressable : View;

  async function removeMemory() {
    const action = memory.deleteAction;
    if (!action) {
      return;
    }
    let errorMessage: string | undefined;
    if (action.table === "checkins") {
      if (onDeleteCheckin) {
        await onDeleteCheckin(action.id);
      } else {
        errorMessage = "今日胶囊删除需要自建后端接口。";
      }
    } else if (action.table === "calendar_events") {
      if (onDeleteCalendarEvent) {
        await onDeleteCalendarEvent(action.id);
      } else {
        errorMessage = "日历事件删除需要自建后端接口。";
      }
    } else if (action.table === "media_files") {
      const photo = memory.photos.find((item) => item.id === action.id);
      if (onDeleteMedia && photo) {
        await onDeleteMedia(photo);
      } else {
        errorMessage = "照片删除需要自建后端接口。";
      }
    } else if (action.table === "couple_footprints") {
      if (onDeleteFootprint) {
        await onDeleteFootprint(action.id);
      } else {
        errorMessage = "足迹删除需要自建后端接口。";
      }
    } else {
      if (onDeleteLetter) {
        await onDeleteLetter(action.id);
      } else {
        errorMessage = "信件删除需要自建后端接口。";
      }
    }
    if (errorMessage) {
      showToast({ title: "删除失败", message: errorMessage, tone: "error" });
      return;
    }
    showToast({ title: "已从记忆中移除", tone: "success" });
    onDeleted();
  }

  const visual = memoryVisualFor(memory.filter);

  return (
    <View style={styles.memoryTimelineItem}>
      <View style={styles.memoryRail}>
        <View style={styles.memoryRailString} />
        <View style={[styles.memoryDotHalo, { opacity: 0.34 + focus * 0.44, transform: [{ scale: 0.92 + focus * 0.34 }] }]} />
        <View style={[styles.memoryDot, { transform: [{ scale: 1 + focus * 0.22 }, { rotate: `${focus * 22}deg` }], boxShadow: `0 0 ${Math.round(6 + focus * 18)}px rgba(184,95,123,${0.14 + focus * 0.22})` } as never]}>
          <View style={styles.memoryDotCream} />
          <View style={styles.memoryDotRose} />
        </View>
        {isLast ? null : <View style={styles.memoryLine} />}
      </View>
      <Container
        {...petAnchorProps(`memory-card-${index}`, "memory-card")}
        accessibilityRole={onPress ? "button" : undefined}
        onPress={onPress}
        style={[
          styles.memoryCard,
          visual.cardStyle,
          focus > 0.28 ? styles.memoryCardFocused : null,
        ]}
      >
        <View pointerEvents="none" style={styles.memoryCardTopTape} />
        {memory.filter === "留言" || memory.filter === "日常" ? <View pointerEvents="none" style={styles.memoryCardRuledLines} /> : null}
        {memory.filter === "信件" ? <View pointerEvents="none" style={styles.memoryLetterFlap} /> : null}
        <MemoryCategoryBadge filter={memory.filter} />
        {memory.filter === "相册" ? <View pointerEvents="none" style={styles.memoryPolaroidFold} /> : null}
        {memory.filter === "纪念日" ? (
          <>
            <View pointerEvents="none" style={styles.memoryAuroraOne} />
            <View pointerEvents="none" style={styles.memoryAuroraTwo} />
          </>
        ) : null}
        <View style={styles.memoryCardContent}>
          <View style={styles.memoryCardHeaderRow}>
            <Text style={[styles.memoryCardTitle, visual.titleStyle]}>{memory.title}</Text>
          </View>
          <Text style={[styles.memoryDate, visual.metaStyle]}>{memory.date} · {memory.tag}</Text>
          <Text style={[styles.memoryCardBody, visual.bodyStyle]}>{memory.body}</Text>
          {memory.deleteAction ? (
            <Pressable {...petSafeActionProps()} accessibilityRole="button" accessibilityLabel="删除这条记忆" onPress={removeMemory} style={styles.memoryDeleteButton}>
              <Trash2 color={colors.accentDark} size={15} />
              <Text style={styles.memoryDeleteText}>删除</Text>
            </Pressable>
          ) : null}
        </View>
        <MemoryPhotoGrid memory={memory} onUploadPhoto={onUploadPhoto} onPreviewPhoto={onPreviewPhoto} />
      </Container>
    </View>
  );
}

function MemoryPhotoGrid({
  memory,
  onUploadPhoto,
  onPreviewPhoto,
}: {
  memory: MemoryTimelineItem;
  onUploadPhoto: () => void;
  onPreviewPhoto: (file: MediaFile, index: number) => void;
}) {
  const previews = memory.photos.slice(0, 9);
  const canUpload = memory.photos.length < maxMemoryPhotos;
  return (
    <View style={styles.memoryMediaColumn}>
      <Pressable
        {...petSafeActionProps()}
        accessibilityRole="button"
        accessibilityLabel="给这条记忆上传图片"
        onPress={canUpload && previews.length === 0 && Platform.OS !== "web" ? () => onUploadPhoto() : undefined}
        style={[styles.memoryPhotoPanel, !previews.length ? { backgroundColor: memory.imageTone } : null]}
      >
        {previews.length ? (
          <View style={styles.memoryPhotoGrid}>
            {previews.map((file, index) => {
              const imageUrl = imagePreviewUrl(file);
              return (
                <BouncyPressable
                  key={file.id}
                  accessibilityRole="button"
                  accessibilityLabel={`预览记忆图片 ${index + 1}`}
                  haptic="selection"
                  onPress={() => onPreviewPhoto(file, index)}
                  style={styles.memoryPhotoCell}
                >
                  {imageUrl ? <CrossFadeImage source={{ uri: imageUrl }} style={styles.memoryPhotoImage} resizeMode="cover" /> : <BreathingSkeleton style={styles.memoryPhotoImage} />}
                </BouncyPressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.memoryThumbEmpty}>
            {memory.iconImage ? (
              <Image source={memory.iconImage} style={styles.memoryThumbIcon} resizeMode="contain" />
            ) : (
              <Mail color="#fff" size={30} strokeWidth={2.4} />
            )}
            <Text style={styles.memoryThumbLabel}>{memory.imageLabel}</Text>
          </View>
        )}
        <View style={styles.memoryPhotoCountBadge}>
          {canUpload ? (
            <BouncyPressable
              {...petSafeActionProps()}
              accessibilityRole="button"
              accessibilityLabel="给这条记忆继续上传图片"
              onPress={Platform.OS === "web" ? undefined : () => onUploadPhoto()}
              haptic="selection"
              style={styles.memoryPhotoAddButton}
            >
              <ImagePlus color={colors.accentDark} size={12} />
              <PhotoUploadInput accessibilityLabel="给这条记忆继续上传图片" multiple onFiles={onUploadPhoto} />
            </BouncyPressable>
          ) : null}
          <Text style={styles.memoryPhotoCountText}>{memory.photos.length}/{maxMemoryPhotos}</Text>
        </View>
        {canUpload && previews.length === 0 ? <PhotoUploadInput accessibilityLabel="给这条记忆上传图片" multiple onFiles={onUploadPhoto} /> : null}
      </Pressable>
    </View>
  );
}

function memoryVisualFor(filter: MemoryFilter) {
  if (filter === "留言") {
    return {
      cardStyle: styles.memoryCardWhisper,
      titleStyle: styles.memoryCardWhisperTitle,
      metaStyle: styles.memoryCardWhisperMeta,
      bodyStyle: null,
    };
  }
  if (filter === "信件") {
    return {
      cardStyle: styles.memoryCardLetter,
      titleStyle: styles.memoryCardLetterTitle,
      metaStyle: styles.memoryCardLetterMeta,
      bodyStyle: null,
    };
  }
  if (filter === "相册") {
    return {
      cardStyle: styles.memoryCardPhoto,
      titleStyle: styles.memoryCardPhotoTitle,
      metaStyle: styles.memoryCardPhotoMeta,
      bodyStyle: null,
    };
  }
  if (filter === "纪念日") {
    return {
      cardStyle: styles.memoryCardAnniversary,
      titleStyle: styles.memoryCardAnniversaryTitle,
      metaStyle: styles.memoryCardAnniversaryMeta,
      bodyStyle: styles.memoryCardAnniversaryBody,
    };
  }
  return {
    cardStyle: styles.memoryCardDaily,
    titleStyle: null,
    metaStyle: null,
    bodyStyle: null,
  };
}

function MemoryCategoryBadge({ filter }: { filter: MemoryFilter }) {
  if (filter === "留言") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryWhisperBadge]}>
        <MessageCircle color="#7b67ad" size={13} strokeWidth={2.8} />
      </View>
    );
  }
  if (filter === "信件") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryWaxBadge]}>
        <View style={styles.memoryWaxInner}>
          <Mail color="#9f6f15" size={12} strokeWidth={2.6} />
        </View>
      </View>
    );
  }
  if (filter === "纪念日") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryGiftBadge]}>
        <Heart color="#fff9f1" fill="#fff9f1" size={12} strokeWidth={2.4} />
      </View>
    );
  }
  if (filter === "相册") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryPhotoBadge]}>
        <ImagePlus color="#7a8893" size={13} strokeWidth={2.6} />
      </View>
    );
  }
  return (
    <View style={[styles.memoryCornerBadge, styles.memoryDailyBadge]}>
      <Sparkles color={colors.accentDark} size={12} strokeWidth={2.6} />
    </View>
  );
}

function buildMemoryTimeline(
  checkins: Checkin[],
  messages: Message[],
  events: CalendarEvent[],
  mediaFiles: MediaFile[],
  letters: LetterPreview[],
  footprints: CoupleFootprint[],
  currentUserId: string
): MemoryTimelineItem[] {
  const photosForTitle = (title: string) => mediaFiles.filter((file) => file.caption === title).slice(0, maxMemoryPhotos);
  const photosForCheckin = (checkin: Checkin, title: string) => mediaFiles
    .filter((file) => {
      const caption = file.caption ?? "";
      return caption === checkinPhotoCaption(checkin) || caption === title;
    })
    .slice(0, maxMemoryPhotos);
  const eventMemories: MemoryTimelineItem[] = events.map((event) => ({
    id: `event-${event.id}`,
    sortDate: event.event_date,
    date: formatMemoryDate(event.event_date),
    title: event.title,
    body: memoryBodyForEvent(event.type),
    tag: eventTypeLabel(event.type),
    filter: memoryFilterForEvent(event.type),
    imageTone: memoryToneForEvent(event.type),
    imageLabel: memoryImageLabelForEvent(event.type),
    iconImage: memoryIconForEvent(event.type),
    photos: photosForTitle(event.title),
    deleteAction: { table: "calendar_events", id: event.id },
  }));
  const checkinMemories: MemoryTimelineItem[] = checkins.map((checkin) => {
    const story = splitStory(checkin.content);
    const title = story.body.length > 18 ? `${story.body.slice(0, 18)}...` : story.body;
    return {
      id: `checkin-${checkin.id}`,
      sortDate: checkin.checkin_date,
      date: formatMemoryDate(checkin.checkin_date),
      title,
      body: story.body,
      tag: story.mood ? `今日胶囊 · ${story.mood}` : "今日胶囊",
      filter: "日常",
      imageTone: story.mood.includes("想") ? colors.moodMiss : "#ead8ce",
      imageLabel: story.mood.includes("想") ? "Miss" : "Daily",
      iconImage: story.iconImage,
      photos: photosForCheckin(checkin, title),
      deleteAction: checkin.user_id === currentUserId ? { table: "checkins", id: checkin.id } : undefined,
    };
  });
  const messageMemories: MemoryTimelineItem[] = messages.map((message) => ({
    id: `message-${message.id}`,
    sortDate: message.created_at,
    date: formatMemoryDate(message.created_at),
    title: "留给彼此的话",
    body: message.body,
    tag: "留言",
    filter: "留言" as MemoryFilter,
    imageTone: "#dfd8e6",
    imageLabel: "Note",
    iconImage: capsuleIcons.note,
    photos: photosForTitle("留给彼此的话"),
  }));
  const letterMemories: MemoryTimelineItem[] = letters.map((letter) => ({
    id: `letter-${letter.id}`,
    sortDate: letter.deliver_at,
    date: formatMemoryDate(letter.deliver_at),
    title: letter.is_locked ? "有一封信正在路上" : letter.title,
    body: letter.is_locked ? "它已经抵达你的记忆里，只是还没到打开的时间。" : letter.body || "这封信安静地留在这里。",
    tag: letter.is_locked ? "待开启信件" : "信件",
    filter: "信件",
    imageTone: letter.is_locked ? "#d9d0e8" : "#dda2b1",
    imageLabel: letter.is_locked ? "Soon" : "Letter",
    iconImage: capsuleIcons.note,
    photos: photosForTitle(letter.is_locked ? "有一封信正在路上" : letter.title),
    letter,
    deleteAction: letter.author_id === currentUserId ? { table: "future_letters", id: letter.id } : undefined,
  }));
  const footprintMemories: MemoryTimelineItem[] = footprints.map((footprint) => ({
    id: `footprint-${footprint.id}`,
    sortDate: footprint.visited_at,
    date: formatMemoryDate(footprint.visited_at),
    title: `去过 ${footprint.title}`,
    body: footprint.note || "你们把这个地方放进了共同足迹里。",
    tag: footprint.latitude !== null && footprint.longitude !== null ? "足迹 · 有坐标" : "足迹",
    filter: "日常" as MemoryFilter,
    imageTone: "#cfe1df",
    imageLabel: "Place",
    iconImage: capsuleIcons.travel,
    photos: photosForTitle(footprint.title),
    deleteAction: footprint.created_by === currentUserId ? { table: "couple_footprints", id: footprint.id } : undefined,
  }));
  const albumMemories: MemoryTimelineItem[] = mediaFiles
    .filter((file) => {
      if (!file.caption) {
        return true;
      }
      if (isCheckinPhotoCaption(file.caption)) {
        return false;
      }
      return ![...eventMemories, ...checkinMemories, ...messageMemories, ...letterMemories, ...footprintMemories].some((memory) => memory.title === file.caption || memory.title === `去过 ${file.caption}`);
    })
    .map((file) => ({
      id: `media-${file.id}`,
      sortDate: file.created_at,
      date: formatMemoryDate(file.created_at),
      title: file.caption || "相册里的瞬间",
      body: "这张照片被放进你们的相册，也会慢慢沉淀成记忆。",
      tag: "相册",
      filter: "相册" as MemoryFilter,
      imageTone: "#d7cbd9",
      imageLabel: "Photo",
      imageUrl: imagePreviewUrl(file),
      photos: [file],
      deleteAction: file.uploader_id === currentUserId ? { table: "media_files", id: file.id, storagePath: file.storage_path } : undefined,
    }));
  return [...eventMemories, ...checkinMemories, ...messageMemories, ...letterMemories, ...footprintMemories, ...albumMemories].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

function memoryFilterForEvent(type: CalendarEvent["type"]): MemoryFilter {
  return type === "anniversary" ? "纪念日" : "日常";
}

function memoryBodyForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "没有刻意做很多安排，只是把那天完整留给彼此，就已经足够特别。";
  if (type === "date") return "那天没有排太满的行程，只是一起看风景、散步，把彼此拍进同一段时间。";
  return "很普通的一天，因为被记下来，就变成了以后会想起的一页。";
}

function memoryToneForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "#d9c4ad";
  if (type === "date") return "#c8d2d7";
  return "#d8c8bd";
}

function memoryImageLabelForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "One Year";
  if (type === "date") return "Sea Escape";
  return "Memory";
}

function memoryIconForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return capsuleIcons.gift;
  if (type === "date") return capsuleIcons.travel;
  return capsuleIcons.daily;
}

function MiniCalendar({
  checkins,
  messages,
  events,
  letters = [],
}: {
  checkins: Array<{ checkin_date: string; content: string | null }>;
  messages: Message[];
  events: CalendarEvent[];
  letters?: LetterPreview[];
  }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridSize = Math.ceil((firstWeekday + monthEnd.getDate()) / 7) * 7;
  const days = Array.from({ length: gridSize }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    return dayNumber >= 1 && dayNumber <= monthEnd.getDate() ? dayNumber : null;
  });
  const isCurrentMonthDate = (value: string) => {
    const date = parseCalendarDate(value);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  };
  const eventDays = new Set(
    events.filter((event) => event.type !== "anniversary" && isCurrentMonthDate(event.event_date)).map((event) => Number(event.event_date.slice(-2)))
  );
  const anniversaryDays = new Set(
    events.filter((event) => event.type === "anniversary" && isCurrentMonthDate(event.event_date)).map((event) => Number(event.event_date.slice(-2)))
  );
  const letterDays = new Set(
    letters
      .map((letter) => new Date(letter.deliver_at))
      .filter((date) => date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth())
      .map((date) => date.getDate())
  );
  const storyByDay = new Map<number, ImageSourcePropType>();
  checkins.forEach((item) => {
    if (isCurrentMonthDate(item.checkin_date)) {
      storyByDay.set(Number(item.checkin_date.slice(-2)), splitStory(item.content).iconImage);
    }
  });
  messages.forEach((message) => {
    const date = new Date(message.created_at);
    if (date.getFullYear() !== today.getFullYear() || date.getMonth() !== today.getMonth()) {
      return;
    }
    const day = date.getDate();
    if (!storyByDay.has(day)) {
      storyByDay.set(day, storyIconImageFromText(message.body));
    }
  });
  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <View style={styles.calendarSurface}>
      <View style={styles.calendarMonthRow}>
        <Text style={styles.calendarMonthText}>{today.getMonth() + 1}月</Text>
        <Text style={styles.calendarMonthMeta}>{today.getFullYear()}</Text>
      </View>
      <View style={styles.weekdayGrid}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayText}>{label}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map((dayNumber, index) => {
          const storyIcon = dayNumber ? storyByDay.get(dayNumber) : undefined;
          const hasEvent = dayNumber ? eventDays.has(dayNumber) : false;
          const hasAnniversary = dayNumber ? anniversaryDays.has(dayNumber) : false;
          const hasLetter = dayNumber ? letterDays.has(dayNumber) : false;
          const isToday = dayNumber === today.getDate();
          return (
            <View key={`${index}-${dayNumber ?? "empty"}`} style={[styles.dayCell, !dayNumber ? styles.dayCellEmpty : null]}>
              {dayNumber ? (
                <View style={[styles.dayNumberBubble, storyIcon || hasEvent || hasLetter || hasAnniversary ? styles.dayCellMarked : null, isToday ? styles.dayCellToday : null]}>
                  <Text style={[styles.dayText, isToday ? styles.dayTextToday : null]}>{dayNumber}</Text>
                  {hasAnniversary ? (
                    <View style={styles.dayHeartMark}>
                      <Heart color={colors.accentDark} fill={colors.accentDark} size={9} strokeWidth={2.6} />
                    </View>
                  ) : null}
                </View>
              ) : null}
              {hasLetter ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Mail color={colors.accentDark} size={16} strokeWidth={2.6} />
                </View>
              ) : storyIcon ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Image source={storyIcon} style={styles.dayImageIcon} resizeMode="contain" />
                </View>
              ) : hasEvent ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Image source={cartoonIcons.calendar} style={styles.dayImageIcon} resizeMode="contain" />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function parseCalendarDate(value: string) {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (year && month && day) {
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function eventTypeLabel(type: string) {
  const labels: Record<string, string> = {
    anniversary: "纪念日",
    date: "约会",
    todo: "普通",
    other: "普通",
  };
  return labels[type] ?? "普通";
}
