import { useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Bell, ChevronLeft, Heart, Info, Lock, LogOut, Mail, MessageCircle, Shield, SlidersHorizontal, Trash2, UserRound, UsersRound, Volume2, VolumeX } from "lucide-react-native";

import { AppTextInput, Card, CoupleAvatarGroup, EmptyState, PrimaryButton, SecondaryButton, SettingRow, TopBar } from "@/components/app-ui/AppUI";
import { DateField, InlineNotice, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { styles } from "@/features/home/homeStyles";
import type { NotificationPreferenceToggleKey, SettingPage } from "@/features/home/homeShared";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { formatShortDate } from "@/lib/dates/date";
import { getWebPushEnvironment, getWebPushPermission, isWebPushSupported, registerForWebPushNotifications } from "@/lib/notifications/webPush";
import { dismissSelfHostNotification, markSelfHostNotificationRead } from "@/lib/selfHost/notificationApi";
import {
  blockSelfHostPartnerAndEndCouple,
  requestSelfHostAccountDeletion,
  submitSelfHostFeedback,
  submitSelfHostReport,
} from "@/lib/selfHost/privacyApi";
import { updateSelfHostActiveCoupleDates } from "@/lib/selfHost/profileApi";
import { getSelfHostNotificationPreferences, updateSelfHostNotificationPreferences } from "@/lib/selfHost/pushApi";
import type { Notification, NotificationPreference, Profile } from "@/lib/supabase/database.types";
import type { PetUserSettings, PetUserSize } from "@/features/pet/userPetSettings";
import { colors } from "@/styles/theme";

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

export function MePage({
  me,
  partner,
  loveDays,
  onSignOut,
  onEndCouple,
  endingCouple,
  onOpenSetting,
}: {
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  loveDays: number;
  onSignOut: () => void;
  onEndCouple: () => void;
  endingCouple: boolean;
  onOpenSetting: (page: SettingPage) => void;
}) {
  const settings: Array<{ label: string; page: SettingPage; icon: ReactNode }> = [
    { label: "个人资料", page: "profile", icon: <UserRound color={colors.accentDark} size={17} /> },
    { label: "情侣资料", page: "couple", icon: <UsersRound color={colors.accentDark} size={17} /> },
    { label: "云宠设置", page: "pet", icon: <SlidersHorizontal color={colors.accentDark} size={17} /> },
    { label: "通知设置", page: "notifications", icon: <Bell color={colors.accentDark} size={17} /> },
    { label: "隐私设置", page: "privacy", icon: <Lock color={colors.accentDark} size={17} /> },
    { label: "关系设置", page: "relationship", icon: <Heart color={colors.accentDark} size={17} /> },
    { label: "反馈入口", page: "feedback", icon: <MessageCircle color={colors.accentDark} size={17} /> },
    { label: "关于 App", page: "about", icon: <Info color={colors.accentDark} size={17} /> },
  ];

  return (
    <View style={styles.stack}>
      <Card soft style={styles.profileHero}>
        <CoupleAvatarGroup me={me} partner={partner} />
        <Text style={styles.profileName}>{me.name} ♡ {partner.name}</Text>
        <Text style={styles.bodyText}>你们已经一起存下第 {loveDays} 天。</Text>
      </Card>
      <Card>
        {settings.map((item) => (
          <SettingRow key={item.label} label={item.label} icon={item.icon} onPress={() => onOpenSetting(item.page)} />
        ))}
      </Card>
      <View style={styles.quietDangerArea}>
        <SecondaryButton label="退出登录" onPress={onSignOut} icon={<LogOut color={colors.accentDark} size={16} />} />
        <SecondaryButton label={endingCouple ? "解除中" : "解除当前关系"} onPress={onEndCouple} loading={endingCouple} danger />
      </View>
    </View>
  );
}

export function SettingsDetailPage({
  page,
  me,
  partner,
  loveDays,
  startedAt,
  onBack,
  onEndCouple,
  endingCouple,
  coupleId,
  partnerId,
  notifications,
  petUserSettings,
  onChangePetUserSettings,
  onChanged,
  onProfileChanged,
  onOpenLetters,
}: {
  page: SettingPage;
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  loveDays: number;
  startedAt: string;
  onBack: () => void;
  onEndCouple: () => void;
  endingCouple: boolean;
  coupleId: string;
  partnerId?: string;
  notifications: Notification[];
  petUserSettings: PetUserSettings;
  onChangePetUserSettings: (next: Partial<PetUserSettings> | ((current: PetUserSettings) => PetUserSettings)) => void;
  onChanged: () => void;
  onProfileChanged: (profile: Profile) => void;
  onOpenLetters: () => void;
}) {
  const { showToast } = useToast();
  const { session, user } = useAuth();
  const [startDate, setStartDate] = useState(startedAt);
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [privacyReason, setPrivacyReason] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState<"report" | "block" | "delete" | null>(null);
  const titles: Record<SettingPage, string> = {
    profile: "个人资料",
    couple: "情侣资料",
    pet: "云宠设置",
    notifications: "通知设置",
    privacy: "隐私设置",
    relationship: "关系设置",
    feedback: "反馈",
    about: "关于 App",
  };

  return (
    <View style={styles.stack}>
      <TopBar title={titles[page]} subtitle={settingSubtitle(page)} left={<BackButton onPress={onBack} />} />
      {page === "profile" ? (
        <ProfileScreen
          onProfileChanged={onProfileChanged}
          onSaved={() => {
            onChanged();
            onBack();
          }}
          embedded
        />
      ) : null}
      {page === "couple" ? (
        <Card>
          {startedAt ? (
            <>
              <CoupleAvatarGroup me={me} partner={partner} />
              <View style={{ gap: 8 }}>
                <Text style={styles.settingLabel}>恋爱开始日期</Text>
                <DateField value={startDate} onChangeText={setStartDate} placeholder="选择日期" />
                <SecondaryButton
                  label={savingStartDate ? "保存中" : "保存开始日期"}
                  loading={savingStartDate}
                  disabled={!startDate || startDate === startedAt}
                  onPress={async () => {
                    setSavingStartDate(true);
                    try {
                      if (!session?.access_token) {
                        throw new Error("自建登录会话已失效，请重新登录。");
                      }
                      await updateSelfHostActiveCoupleDates({
                        accessToken: session.access_token,
                        relationshipStartedAt: startDate,
                      });
                      showToast({ title: "开始日期已更新", tone: "success" });
                      onChanged();
                    } catch (error) {
                      showToast({ title: "保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
                    } finally {
                      setSavingStartDate(false);
                    }
                  }}
                />
              </View>
              <InfoRow label="当前关系" value="恋爱中" />
              <InfoRow label="同频天数" value={`${loveDays} 天`} />
            </>
          ) : (
            <EmptyState title="还没有绑定另一半" description="绑定后这里会显示情侣资料、开始日期和同频天数。" />
          )}
        </Card>
      ) : null}
      {page === "pet" ? (
        <PetUserSettingsPanel settings={petUserSettings} onChange={onChangePetUserSettings} />
      ) : null}
      {page === "notifications" ? (
        <NotificationSettingsPanel notifications={notifications} onChanged={onChanged} onOpenLetters={onOpenLetters} />
      ) : null}
      {page === "privacy" ? (
        <Card>
          <SettingRow label="只有当前情侣关系可见" icon={<Shield color={colors.accentDark} size={17} />} />
          <InfoRow label="头像" value="本人和当前伴侣可见" />
          <InfoRow label="相册" value="私有存储" />
          <AppTextInput value={privacyReason} onChangeText={setPrivacyReason} placeholder="举报、拉黑或注销原因（可选）" multiline style={styles.messageInput} />
          <SecondaryButton
            label={privacyBusy === "report" ? "提交中" : "举报当前伴侣"}
            loading={privacyBusy === "report"}
            icon={<Shield color={colors.accentDark} size={16} />}
            onPress={async () => {
              if (!user || !partnerId) return;
              setPrivacyBusy("report");
              try {
                if (!session?.access_token) {
                  throw new Error("自建登录会话已失效，请重新登录。");
                }
                await submitSelfHostReport({
                  accessToken: session.access_token,
                  coupleId,
                  reportedUserId: partnerId,
                  reason: privacyReason.trim() || "用户从隐私设置提交举报",
                });
                showToast({ title: "举报已提交", message: "系统已记录处理线索，后续会继续完善审核流程。", tone: "success" });
                setPrivacyReason("");
                onBack();
              } catch (error) {
                showToast({ title: "举报失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
              } finally {
                setPrivacyBusy(null);
              }
            }}
          />
          <SecondaryButton
            label={privacyBusy === "block" ? "处理中" : "拉黑并解除关系"}
            danger
            loading={privacyBusy === "block"}
            icon={<Lock color={colors.accentDark} size={16} />}
            onPress={async () => {
              setPrivacyBusy("block");
              try {
                if (!session?.access_token) {
                  throw new Error("自建登录会话已失效，请重新登录。");
                }
                await blockSelfHostPartnerAndEndCouple({
                  accessToken: session.access_token,
                  reason: privacyReason.trim() || null,
                });
                showToast({ title: "已拉黑并解除关系", message: "双方不能继续写入原情侣空间。", tone: "success" });
                onChanged();
                onBack();
              } catch (error) {
                showToast({ title: "拉黑失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
              } finally {
                setPrivacyBusy(null);
              }
            }}
          />
          <SecondaryButton
            label={privacyBusy === "delete" ? "提交中" : "申请注销账号"}
            danger
            loading={privacyBusy === "delete"}
            icon={<Trash2 color={colors.accentDark} size={16} />}
            onPress={async () => {
              setPrivacyBusy("delete");
              try {
                if (!session?.access_token) {
                  throw new Error("自建登录会话已失效，请重新登录。");
                }
                await requestSelfHostAccountDeletion({
                  accessToken: session.access_token,
                  reason: privacyReason.trim() || null,
                });
                showToast({ title: "注销申请已提交", message: "账号已进入待注销状态，不会立即物理删除。", tone: "success" });
                onChanged();
                onBack();
              } catch (error) {
                showToast({ title: "注销申请失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
              } finally {
                setPrivacyBusy(null);
              }
            }}
          />
        </Card>
      ) : null}
      {page === "relationship" ? (
        <Card>
          <Text style={styles.sectionTitle}>恋爱开始日期</Text>
          <DateField value={startDate} onChangeText={setStartDate} placeholder="选择日期" />
          <SecondaryButton
            label={savingStartDate ? "保存中" : "保存开始日期"}
            loading={savingStartDate}
            disabled={!startDate || startDate === startedAt}
            onPress={async () => {
              setSavingStartDate(true);
              try {
                if (!session?.access_token) {
                  throw new Error("自建登录会话已失效，请重新登录。");
                }
                await updateSelfHostActiveCoupleDates({
                  accessToken: session.access_token,
                  relationshipStartedAt: startDate,
                });
                showToast({ title: "开始日期已更新", tone: "success" });
                onChanged();
                onBack();
              } catch (error) {
                showToast({ title: "保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
              } finally {
                setSavingStartDate(false);
              }
            }}
          />
          <InfoRow label="关系状态" value="恋爱中" />
          <View style={styles.compactDanger}>
            <Text style={styles.quietDangerText}>不建议轻易解除关系；这里仅作为必要时的关系管理入口。</Text>
            <SecondaryButton label={endingCouple ? "解除中" : "解除关系"} onPress={onEndCouple} loading={endingCouple} danger />
          </View>
        </Card>
      ) : null}
      {page === "feedback" ? (
        <Card>
          <AppTextInput value={feedback} onChangeText={setFeedback} placeholder="想反馈什么？" multiline style={styles.feedbackInput} />
          <PrimaryButton
            label={feedbackBusy ? "提交中" : "提交反馈"}
            disabled={!feedback.trim() || feedbackBusy}
            loading={feedbackBusy}
            onPress={async () => {
              setFeedbackBusy(true);
              try {
                if (!session?.access_token) {
                  throw new Error("自建登录会话已失效，请重新登录。");
                }
                await submitSelfHostFeedback({
                  accessToken: session.access_token,
                  body: feedback.trim(),
                  coupleId: coupleId || null,
                  metadata: { source: "settings" },
                });
                showToast({ title: "反馈已记录", message: "我们已经收到这条反馈。", tone: "success" });
                setFeedback("");
                onBack();
              } catch (error) {
                showToast({ title: "反馈提交失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
              } finally {
                setFeedbackBusy(false);
              }
            }}
          />
        </Card>
      ) : null}
      {page === "about" ? (
        <Card>
          <Text style={styles.aboutTitle}>同频跳动</Text>
          <Text style={styles.bodyText}>一个只属于两个人的轻量共同空间。</Text>
          <InfoRow label="版本" value="正式版" />
          <InfoRow label="阶段" value="线上功能维护" />
          <InlineNotice tone="info">用户协议与隐私政策已随正式版流程维护。</InlineNotice>
        </Card>
      ) : null}
    </View>
  );
}

function settingSubtitle(page: SettingPage) {
  const subtitles: Record<SettingPage, string> = {
    profile: "管理你展示给 TA 的资料。",
    couple: "查看你们的情侣空间信息。",
    pet: "控制当前设备上的云宠体验。",
    notifications: "管理站内通知和系统推送。",
    privacy: "控制关系数据和个人状态边界。",
    relationship: "管理当前情侣关系。",
    feedback: "告诉我们哪里不顺手。",
    about: "产品版本和说明。",
  };
  return subtitles[page];
}

function ToggleRow({
  label,
  enabled = false,
  disabled = false,
  onPress,
}: {
  label: string;
  enabled?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled || !onPress} style={[styles.toggleRow, disabled ? styles.disabledRow : null]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={[styles.switchTrack, enabled ? styles.switchTrackActive : null]}>
        <View style={[styles.switchThumb, enabled ? styles.switchThumbActive : null]} />
      </View>
    </Pressable>
  );
}

function PetUserSettingsPanel({
  settings,
  onChange,
}: {
  settings: PetUserSettings;
  onChange: (next: Partial<PetUserSettings> | ((current: PetUserSettings) => PetUserSettings)) => void;
}) {
  const { showToast } = useToast();
  const sizeOptions: Array<{ size: PetUserSize; label: string }> = [
    { size: "small", label: "小" },
    { size: "medium", label: "中" },
    { size: "large", label: "大" },
  ];

  function resetPosition() {
    onChange((current) => ({ ...current, positionResetAt: Date.now() }));
    showToast({ title: "位置已重置", message: "全局云宠会回到当前页面的默认锚点。", tone: "success" });
  }

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>当前设备体验</Text>
          {settings.soundEnabled ? <Volume2 color={colors.accentDark} size={18} /> : <VolumeX color={colors.accentDark} size={18} />}
        </View>
        <ToggleRow label="显示云宠" enabled={settings.visible} onPress={() => onChange({ visible: !settings.visible })} />
        <ToggleRow label="播放声音提示" enabled={settings.soundEnabled} onPress={() => onChange({ soundEnabled: !settings.soundEnabled })} />
        <ToggleRow label="允许自主漫游" enabled={settings.autonomousRoamingEnabled} onPress={() => onChange({ autonomousRoamingEnabled: !settings.autonomousRoamingEnabled })} />
        <ToggleRow label="减少动画强度" enabled={settings.reducedMotion} onPress={() => onChange({ reducedMotion: !settings.reducedMotion })} />
        <InfoRow label="共享状态" value="不会因本机隐藏而删除" />
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>云宠大小</Text>
        <View style={styles.petSizeSegment}>
          {sizeOptions.map((option) => {
            const active = settings.size === option.size;
            return (
              <Pressable
                key={option.size}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onChange({ size: option.size })}
                style={[styles.petSizeOption, active ? styles.petSizeOptionActive : null]}
              >
                <Text style={[styles.petSizeOptionText, active ? styles.petSizeOptionTextActive : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <SecondaryButton label="重置全局云宠位置" onPress={resetPosition} icon={<SlidersHorizontal color={colors.accentDark} size={16} />} />
        <InlineNotice tone="info">这些设置只影响当前登录用户和当前设备；情侣共享的云宠状态、记忆和位置仍保留。</InlineNotice>
      </Card>
    </View>
  );
}

function NotificationSettingsPanel({
  notifications,
  onChanged,
  onOpenLetters,
}: {
  notifications: Notification[];
  onChanged: () => void;
  onOpenLetters: () => void;
}) {
  const { session, user } = useAuth();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [activeTokens, setActiveTokens] = useState(0);
  const [currentWebPushEnabled, setCurrentWebPushEnabled] = useState(false);
  const [webPushPermission, setWebPushPermission] = useState<string>(Platform.OS === "web" ? getWebPushPermission() : "native");
  const [webPushServiceUnavailable, setWebPushServiceUnavailable] = useState(false);
  const [webPushEnvironment, setWebPushEnvironment] = useState(() => (Platform.OS === "web" ? getWebPushEnvironment() : null));
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<NotificationPreferenceToggleKey | null>(null);
  const [registeringWebPush, setRegisteringWebPush] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadPreferences() {
      if (!user) return;
      setLoading(true);
      try {
        let preferenceData: NotificationPreference | null = null;
        let activePushTokenCount = 0;
        if (!session?.access_token) {
          throw new Error("自建登录会话已失效，请重新登录。");
        }
        const result = await getSelfHostNotificationPreferences({ accessToken: session.access_token });
        preferenceData = result.preferences;
        activePushTokenCount = result.push.activeTokens;
        if (!mounted) return;
        setPreferences(preferenceData);
        setActiveTokens(activePushTokenCount);
        if (Platform.OS === "web") {
          setWebPushPermission(getWebPushPermission());
          setWebPushEnvironment(getWebPushEnvironment());
          if (isWebPushSupported()) {
            const registration = await navigator.serviceWorker.getRegistration("/sw.js");
            const subscription = await registration?.pushManager.getSubscription();
            if (!mounted) return;
            setCurrentWebPushEnabled(Boolean(subscription));
            setWebPushServiceUnavailable(false);
          } else {
            setCurrentWebPushEnabled(false);
          }
        }
      } catch (error) {
        if (mounted) {
          showToast({ title: "通知设置加载失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPreferences();
    return () => {
      mounted = false;
    };
  }, [session?.access_token, showToast, user]);

  async function togglePreference(key: NotificationPreferenceToggleKey) {
    if (!user || !preferences || savingKey) return;
    const nextValue = !preferences[key];
    setSavingKey(key);
    setPreferences({ ...preferences, [key]: nextValue });
    const update: Partial<Pick<NotificationPreference, NotificationPreferenceToggleKey>> =
      key === "push_enabled"
        ? { push_enabled: nextValue }
        : key === "message_enabled"
          ? { message_enabled: nextValue }
          : key === "interaction_enabled"
            ? { interaction_enabled: nextValue }
            : key === "checkin_enabled"
              ? { checkin_enabled: nextValue }
              : key === "letter_enabled"
                ? { letter_enabled: nextValue }
                : key === "calendar_enabled"
                  ? { calendar_enabled: nextValue }
                  : { quiet_hours_enabled: nextValue };
    try {
      if (!session?.access_token) {
        throw new Error("自建登录会话已失效，请重新登录。");
      }
      const result = await updateSelfHostNotificationPreferences({
        accessToken: session.access_token,
        update,
      });
      setPreferences(result.preferences);
      setActiveTokens(result.push.activeTokens);
      showToast({ title: "通知设置已更新", tone: "success" });
    } catch (error) {
      setPreferences(preferences);
      showToast({ title: "通知设置保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setSavingKey(null);
    }
  }

  async function enableWebPush() {
    if (registeringWebPush) return;
    setRegisteringWebPush(true);
    try {
      const result = await registerForWebPushNotifications();
      setWebPushPermission(getWebPushPermission());
      setWebPushEnvironment(Platform.OS === "web" ? getWebPushEnvironment() : null);
      if (result.status !== "registered") {
        setWebPushServiceUnavailable(result.status === "service_unavailable");
        showToast({ title: "网页推送未开启", message: result.message ?? "当前浏览器暂时不能注册网页推送。", tone: "error" });
        return;
      }
      setCurrentWebPushEnabled(true);
      setWebPushServiceUnavailable(false);
      setActiveTokens((count) => Math.max(1, count));
      showToast({ title: "网页推送已开启", message: "之后对方留言、互动和胶囊信会尝试推送到这台设备。", tone: "success" });
    } catch (error) {
      showToast({ title: "网页推送未开启", message: error instanceof Error ? error.message : "当前浏览器暂时不能注册网页推送。", tone: "error" });
    } finally {
      setRegisteringWebPush(false);
    }
  }

  const webPushReady = Platform.OS !== "web" || isWebPushSupported();
  const webPushNotice =
    Platform.OS !== "web"
      ? "会推送：对方新留言、快捷互动、今日胶囊和胶囊信。默认不推送：自己触发的提醒、删除/已读/设置变更、普通日历事件、宠物喂养和相册上传。"
      : webPushServiceUnavailable && webPushEnvironment?.isAndroidEdge
        ? "当前 Android Edge 已允许通知，但浏览器后台推送订阅不可用。中国大陆环境下请使用站内通知；可靠系统推送需要后续接入原生 Android 国内厂商推送通道。"
        : webPushServiceUnavailable
          ? "当前浏览器已允许通知，但推送服务注册失败。请清除本站数据、重新添加到桌面，或换用支持 Web Push 的浏览器。"
          : webPushEnvironment?.isAndroidEdge
            ? "Android Edge 当前不作为可用网页后台推送渠道。站内通知仍可正常使用；可靠系统推送需要后续原生 Android 国内厂商推送。"
            : "会推送：对方新留言、快捷互动、今日胶囊和胶囊信。iPhone 网页推送需要先把网站添加到主屏幕，再从主屏幕图标打开后授权。";
  const deviceStatus =
    Platform.OS === "web"
      ? currentWebPushEnabled
        ? "当前网页已开启"
        : webPushServiceUnavailable || webPushEnvironment?.isAndroidEdge
          ? "推送服务不可用"
          : webPushPermission === "denied"
          ? "浏览器已拒绝通知"
          : webPushReady
            ? "当前网页可开启"
            : "当前浏览器不支持"
      : activeTokens > 0
        ? "已开启推送"
        : "等待系统授权";

  return (
    <View style={styles.stack}>
      <Card>
        <Text style={styles.sectionTitle}>系统推送</Text>
        {loading || !preferences ? (
          <Text style={styles.bodyText}>正在读取推送设置。</Text>
        ) : (
          <>
            <ToggleRow label="接收系统推送" enabled={preferences.push_enabled} disabled={savingKey === "push_enabled"} onPress={() => togglePreference("push_enabled")} />
            <ToggleRow label="留言推送" enabled={preferences.message_enabled} disabled={!preferences.push_enabled || savingKey === "message_enabled"} onPress={() => togglePreference("message_enabled")} />
            <ToggleRow label="此刻同频互动推送" enabled={preferences.interaction_enabled} disabled={!preferences.push_enabled || savingKey === "interaction_enabled"} onPress={() => togglePreference("interaction_enabled")} />
            <ToggleRow label="今日胶囊推送" enabled={preferences.checkin_enabled} disabled={!preferences.push_enabled || savingKey === "checkin_enabled"} onPress={() => togglePreference("checkin_enabled")} />
            <ToggleRow label="胶囊信推送" enabled={preferences.letter_enabled} disabled={!preferences.push_enabled || savingKey === "letter_enabled"} onPress={() => togglePreference("letter_enabled")} />
            <ToggleRow label="事件推送" enabled={preferences.calendar_enabled} disabled={!preferences.push_enabled || savingKey === "calendar_enabled"} onPress={() => togglePreference("calendar_enabled")} />
            <ToggleRow label="夜间免打扰" enabled={preferences.quiet_hours_enabled} disabled={!preferences.push_enabled || savingKey === "quiet_hours_enabled"} onPress={() => togglePreference("quiet_hours_enabled")} />
            <InfoRow label="当前设备" value={deviceStatus} />
            {Platform.OS === "web" ? (
              <SecondaryButton
                label={registeringWebPush ? "开启中" : "开启当前网页推送"}
                onPress={() => void enableWebPush()}
                disabled={!preferences.push_enabled || !webPushReady || webPushPermission === "denied" || Boolean(webPushEnvironment?.isAndroidEdge)}
                loading={registeringWebPush}
                icon={<Bell color={colors.accentDark} size={16} />}
              />
            ) : null}
          </>
        )}
        <InlineNotice tone={webPushServiceUnavailable || webPushEnvironment?.isAndroidEdge ? "error" : "info"}>{webPushNotice}</InlineNotice>
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>站内通知</Text>
        {notifications.length === 0 ? <EmptyState title="暂时没有提醒" description="来信、留言、胶囊和事件会出现在这里。" /> : null}
        {notifications.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} onChanged={onChanged} onOpenLetters={onOpenLetters} />
        ))}
      </Card>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
}

function NotificationRow({ notification, onChanged, onOpenLetters }: { notification: Notification; onChanged: () => void; onOpenLetters: () => void }) {
  const { showToast } = useToast();
  const { session } = useAuth();
  async function markRead() {
    if (!session?.access_token) {
      showToast({ title: "操作失败", message: "登录状态已失效，请重新登录。", tone: "error" });
      return;
    }
    try {
      await markSelfHostNotificationRead({ accessToken: session.access_token, notificationId: notification.id });
      onChanged();
    } catch (error) {
      showToast({ title: "操作失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    }
  }

  async function dismiss() {
    if (!session?.access_token) {
      showToast({ title: "关闭失败", message: "登录状态已失效，请重新登录。", tone: "error" });
      return;
    }
    try {
      await dismissSelfHostNotification({ accessToken: session.access_token, notificationId: notification.id });
      onChanged();
    } catch (error) {
      showToast({ title: "关闭失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    }
  }

  return (
    <View style={styles.notificationRow}>
      <View style={styles.notificationIcon}>
        {notification.type === "letter" ? <Mail color={colors.accentDark} size={17} /> : <Bell color={colors.accentDark} size={17} />}
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.activityTitle}>{notification.title}</Text>
        <Text style={styles.activityMeta}>{notification.body || new Date(notification.created_at).toLocaleString("zh-CN")}</Text>
      </View>
      {notification.type === "letter" ? <SecondaryButton label="查看" onPress={onOpenLetters} /> : null}
      {!notification.read_at ? <SecondaryButton label="已读" onPress={markRead} /> : null}
      <SecondaryButton label="关闭" onPress={dismiss} />
    </View>
  );
}
