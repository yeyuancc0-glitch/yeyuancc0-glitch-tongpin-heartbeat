import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Gift, ShoppingBag, Star, Trash2 } from "lucide-react-native";

import { AppTextInput, Card, PrimaryButton, SecondaryButton } from "@/components/app-ui/AppUI";
import { DateField, InlineNotice, useToast } from "@/components/ui";
import { petMemorySummaryText, petMemoryTone, petMemoryTypeLabel } from "@/features/creation/creationSpaceLogic";
import { styles } from "@/features/home/homeStyles";
import { petSafeActionProps } from "@/features/home/petDomProps";
import { formatMemoryDate } from "@/features/memory/memoryUtils";
import { renderPortal } from "@/lib/platform/portal";
import type { PetMemory } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { colors } from "@/styles/theme";

export function FootprintEditorModal({
  editing,
  title,
  date,
  note,
  busy,
  canSave,
  onTitleChange,
  onDateChange,
  onNoteChange,
  onCancel,
  onSave,
}: {
  editing: boolean;
  title: string;
  date: string;
  note: string;
  busy: boolean;
  canSave: boolean;
  onTitleChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const modal = (
    <View role="dialog" aria-modal={true} style={styles.footprintModalLayer}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭足迹编辑" onPress={onCancel} style={styles.footprintModalBackdrop} />
      <Card style={styles.footprintModalCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{editing ? "编辑足迹" : "点亮新足迹"}</Text>
            <Text style={styles.footprintModalHint}>只要地点和日期，就能留下一次共同经过。</Text>
          </View>
          <BouncyPressable accessibilityRole="button" accessibilityLabel="关闭足迹编辑" onPress={onCancel} haptic="selection" style={styles.footprintModalClose}>
            <Text style={styles.footprintModalCloseText}>×</Text>
          </BouncyPressable>
        </View>
        <View style={styles.footprintForm}>
          <AppTextInput value={title} onChangeText={onTitleChange} placeholder="地点名，例如 晚风桥边" maxLength={28} />
          <DateField value={date} onChangeText={onDateChange} placeholder="选择日期" />
          <AppTextInput value={note} onChangeText={onNoteChange} placeholder="备注（可选）" multiline style={styles.footprintNoteInput} />
          <InlineNotice tone="info">新增成功会获得日常粮 +1 和心愿星糖 +10。</InlineNotice>
          <View {...petSafeActionProps()} style={styles.creationActionRow}>
            <SecondaryButton label="取消" onPress={onCancel} />
            <PrimaryButton label={busy ? "保存中" : editing ? "更新足迹" : "点亮并领取养分"} onPress={onSave} disabled={!canSave} loading={busy} icon={<Gift color="#fff" size={16} />} />
          </View>
        </View>
      </Card>
    </View>
  );

  return renderPortal(modal);
}

export function PetMemoryRow({
  memory,
  isLast,
  disabled = false,
}: {
  memory: PetMemory;
  isLast: boolean;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const core = memory.memory_scope === "core";
  const summary = petMemorySummaryText(memory.summary);
  const tone = petMemoryTone(memory.memory_type, core);

  async function toggleRemember() {
    if (disabled || busy) {
      showToast({ title: "宠物记忆暂未开放", message: "这项编辑会等自建后端记忆 API 接好后再打开。", tone: "info" });
      return;
    }
    setBusy(true);
    try {
      showToast({ title: "宠物记忆暂未开放", message: "这项编辑会等自建后端记忆 API 接好后再打开。", tone: "info" });
    } catch (error) {
      showToast({ title: "记忆更新失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory() {
    if (disabled || busy) {
      showToast({ title: "宠物记忆暂未开放", message: "这项编辑会等自建后端记忆 API 接好后再打开。", tone: "info" });
      return;
    }
    setBusy(true);
    try {
      showToast({ title: "宠物记忆暂未开放", message: "这项编辑会等自建后端记忆 API 接好后再打开。", tone: "info" });
    } catch (error) {
      showToast({ title: "删除记忆失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.petMemoryTrailRow}>
      <View style={styles.petMemoryRail}>
        <View style={[styles.petMemoryNode, { backgroundColor: tone.node, borderColor: tone.border }]}>
          {core ? <Star color="#fff" fill="#fff" size={11} strokeWidth={2.4} /> : <View style={styles.petMemoryNodeDot} />}
        </View>
        {isLast ? null : <View style={styles.petMemoryRailLine} />}
      </View>
      <View style={[styles.petMemoryNote, { borderColor: tone.border, backgroundColor: tone.wash }]}>
        <View style={styles.petMemoryNoteHeader}>
          <Text style={styles.petMemorySummary}>{summary}</Text>
          <View style={[styles.petMemoryTag, { backgroundColor: tone.tag }]}>
            <Text style={styles.petMemoryTagText}>{core ? "长期" : petMemoryTypeLabel(memory.memory_type)}</Text>
          </View>
        </View>
        <Text style={styles.petMemoryMeta}>{formatMemoryDate(memory.created_at)}</Text>
        <View style={styles.petMemoryActions}>
          <PetMemoryTrailButton
            label={busy ? "处理中" : core ? "移出长期" : "记住"}
            disabled={busy}
            active={core}
            icon={<Star color={core ? "#fff" : colors.accentDark} fill={core ? "#fff" : "transparent"} size={13} strokeWidth={2.5} />}
            onPress={() => void toggleRemember()}
          />
          <PetMemoryTrailButton
            label="删除"
            danger
            disabled={busy}
            icon={<Trash2 color={colors.accentDark} size={13} strokeWidth={2.5} />}
            onPress={() => void deleteMemory()}
          />
        </View>
      </View>
    </View>
  );
}

function PetMemoryTrailButton({
  label,
  onPress,
  icon,
  danger,
  active,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon: ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <BouncyPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      haptic={active ? "selection" : "light"}
      style={[styles.petMemoryTrailAction, active ? styles.petMemoryTrailActionActive : null, danger ? styles.petMemoryTrailActionDanger : null, disabled ? styles.petMemoryTrailActionDisabled : null]}
    >
      {icon}
      <Text style={[styles.petMemoryTrailActionText, active ? styles.petMemoryTrailActionTextActive : null]}>{label}</Text>
    </BouncyPressable>
  );
}

export function CreationFoodCard({
  title,
  description,
  price,
  count,
  icon,
  loading,
  disabled,
  onBuy,
}: {
  title: string;
  description: string;
  price: number;
  count: number;
  icon: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onBuy: () => void;
}) {
  return (
    <View style={styles.creationFoodCard}>
      <View style={styles.creationFoodTop}>
        <View style={styles.creationFoodIcon}>{icon}</View>
        <Text style={styles.creationFoodCount}>{count} 份</Text>
      </View>
      <Text style={styles.creationFoodTitle}>{title}</Text>
      <Text style={styles.creationFoodDescription}>{description}</Text>
      <SecondaryButton label={`${price} 点购买`} onPress={onBuy} loading={loading} disabled={disabled} icon={<ShoppingBag color={colors.accentDark} size={15} />} />
    </View>
  );
}
