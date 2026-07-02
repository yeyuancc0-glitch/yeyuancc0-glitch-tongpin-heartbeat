import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera } from "lucide-react-native";

import { AppTextInput, Card, PrimaryButton, SecondaryButton, TopBar } from "@/components/app-ui/AppUI";
import { DateField, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoUploadInput } from "@/features/media/PhotoUploadInput";
import {
  createSelfHostAvatarReadUrl,
  deleteSelfHostAvatar,
  getSelfHostProfile,
  updateSelfHostProfile,
  uploadSelfHostAvatar,
} from "@/lib/selfHost/profileApi";
import type { Profile } from "@/lib/supabase/database.types";
import {
  createImageThumbnail,
  isSupportedImage,
} from "@/lib/media/imageStorage";
import { colors } from "@/styles/theme";

export function ProfileScreen({
  onSaved,
  onCancel,
  onProfileChanged,
  embedded = false,
}: {
  onSaved?: () => void;
  onCancel?: () => void;
  onProfileChanged?: (profile: Profile) => void;
  embedded?: boolean;
}) {
  const { session, user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [isLunarBirthdate, setIsLunarBirthdate] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasCouple, setHasCouple] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!session?.access_token) {
      return;
    }
    void getSelfHostProfile(session.access_token)
      .then(({ activeCouple, profile: nextProfile }) => {
        setProfile(nextProfile);
        setHasCouple(activeCouple?.status === "active");
        if (nextProfile.display_name) setDisplayName(nextProfile.display_name);
        if (nextProfile.birthdate) {
          setBirthdate(nextProfile.birthdate);
        }
        if (nextProfile.is_lunar_birthdate) {
          setIsLunarBirthdate(nextProfile.is_lunar_birthdate);
        }
        if (nextProfile.avatar_url) setAvatarPath(nextProfile.avatar_url);
        setAvatarPreviewUrl(null);
        if (nextProfile.avatar_url) {
          void createSelfHostAvatarReadUrl({
            accessToken: session.access_token,
            userId: nextProfile.id,
            variant: nextProfile.avatar_thumbnail_url ? "thumbnail" : "original",
          })
            .then(setAvatarPreviewUrl)
            .catch((error) => {
              console.warn("Self-host avatar preview failed:", error);
            });
        }
      })
      .catch((error) => {
        showToast({ title: "资料加载失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
      });
  }, [session?.access_token, showToast, user]);

  function pickAvatar() {
    if (!user) {
      return;
    }
    if (Platform.OS !== "web") {
      showToast({ title: "当前端暂不支持", message: "头像上传当前先在 Web 端开放。", tone: "info" });
    }
  }

  async function handleAvatarFiles(files: FileList) {
    if (!user) {
      return;
    }
    const file = files[0];
    if (!file) {
      return;
    }
    if (!isSupportedImage(file, 4 * 1024 * 1024)) {
      showToast({ title: "头像格式不支持", message: "请上传 4MB 以内的 JPG、PNG、WebP 或 GIF 图片。", tone: "error" });
      return;
    }

    setUploadingAvatar(true);
    try {
      if (!session?.access_token) {
        showToast({ title: "头像上传失败", message: "登录状态已失效，请重新登录。", tone: "error" });
        return;
      }
      const thumbnailFile = await createImageThumbnail(file, 220, 0.76);
      const nextProfile = await uploadSelfHostAvatar({
        accessToken: session.access_token,
        file,
        thumbnailFile,
      });
      setProfile(nextProfile);
      onProfileChanged?.(nextProfile);
      setAvatarPath(nextProfile.avatar_url ?? null);
      const nextPreviewUrl = URL.createObjectURL(file);
      setAvatarPreviewUrl((current) => {
        if (current?.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return nextPreviewUrl;
      });
      showToast({ title: "头像已更新", tone: "success" });
    } catch (error) {
      showToast({ title: "头像上传失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!user || !avatarPath) {
      return;
    }
    setUploadingAvatar(true);
    try {
      if (!session?.access_token) {
        showToast({ title: "移除头像失败", message: "登录状态已失效，请重新登录。", tone: "error" });
        return;
      }
      const nextProfile = await deleteSelfHostAvatar(session.access_token);
      setProfile(nextProfile);
      onProfileChanged?.(nextProfile);
      setAvatarPath(null);
      setAvatarPreviewUrl(null);
      showToast({ title: "头像已移除", tone: "success" });
    } catch (error) {
      showToast({ title: "移除头像失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile() {
    if (!user) {
      return;
    }

    setBusy(true);
    try {
      if (!session?.access_token) {
        showToast({ title: "保存失败", message: "登录状态已失效，请重新登录。", tone: "error" });
        return;
      }
      const nextProfile = await updateSelfHostProfile({
        accessToken: session.access_token,
        displayName: displayName.trim(),
        birthday: birthdate || null,
        isLunarBirthdate: isLunarBirthdate,
      });
      setProfile(nextProfile);
      onProfileChanged?.(nextProfile);

      showToast({
        title: "资料已保存",
        message: hasCouple ? undefined : "下一步可以绑定另一半。",
        tone: "success",
      });
      onSaved?.();
    } catch (error) {
      showToast({ title: "保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {embedded ? null : <TopBar title={profile ? "完善资料" : "先认识一下你"} subtitle="头像和昵称会展示给另一半。" />}
      <Card>
        <Pressable accessibilityRole="button" accessibilityLabel="上传头像" onPress={Platform.OS === "web" ? undefined : pickAvatar} style={styles.avatarUpload}>
          <View style={styles.avatarCircleOuter}>
            <View style={styles.avatarCircleInner}>
              {avatarPreviewUrl ? (
                <Image source={{ uri: avatarPreviewUrl }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Camera color={colors.accentDark} size={26} />
              )}
            </View>
          </View>
          <Text style={styles.uploadText}>{uploadingAvatar ? "头像处理中" : avatarPreviewUrl ? "更换头像" : "上传头像"}</Text>
          <Text style={styles.hintText}>让 TA 一眼认出你</Text>
          <PhotoUploadInput accessibilityLabel="上传头像" disabled={uploadingAvatar || !user} onFiles={handleAvatarFiles} />
        </Pressable>
        {avatarPath ? <SecondaryButton label="移除头像" onPress={removeAvatar} danger loading={uploadingAvatar} /> : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>昵称</Text>
          <AppTextInput value={displayName} onChangeText={setDisplayName} placeholder="你的昵称" style={styles.creamInput} />
        </View>
        <View style={styles.fieldGroup}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.label}>生日（可选）</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsLunarBirthdate(!isLunarBirthdate)}
              style={styles.lunarToggle}
            >
              <Text style={[styles.lunarToggleText, isLunarBirthdate && styles.lunarToggleTextActive]}>
                {isLunarBirthdate ? "农历" : "公历"}
              </Text>
            </Pressable>
          </View>
          <DateField value={birthdate} onChangeText={setBirthdate} placeholder="选择生日" style={styles.creamInput} />
          {isLunarBirthdate ? (
            <Text style={styles.lunarHint}>请选择对应的公历日期，我们将按农历为您记录并提醒。</Text>
          ) : null}
        </View>
        <View style={{ height: 6 }} />
        <PrimaryButton label={busy ? "保存中" : "完成"} onPress={saveProfile} disabled={!displayName.trim()} loading={busy} />
        {embedded ? null : <SecondaryButton label="稍后再补充" onPress={onCancel ?? onSaved} />}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 18,
  },
  avatarUpload: {
    position: "relative",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
  },
  avatarCircleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255, 248, 250, 0.6)",
    borderColor: "rgba(224, 143, 165, 0.4)", // 玫瑰金外圈
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(243, 95, 137, 0.12)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  avatarCircleInner: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: "#fff",
    borderColor: "rgba(224, 143, 165, 0.25)", // 玫瑰金内圈
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  uploadText: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "900",
  },
  hintText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  creamInput: {
    backgroundColor: "rgba(255, 248, 250, 0.72)",
    borderColor: "rgba(243, 95, 137, 0.22)",
    borderWidth: 1.5,
    borderRadius: 22,
    minHeight: 52,
    paddingHorizontal: 16,
    color: colors.ink,
    fontSize: 15,
    shadowColor: "rgba(243, 95, 137, 0.04)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  lunarToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(243, 95, 137, 0.1)",
  },
  lunarToggleText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
  },
  lunarToggleTextActive: {
    color: colors.accentDark,
  },
  lunarHint: {
    fontSize: 11,
    color: colors.accentDark,
    marginTop: 2,
    paddingHorizontal: 4,
  },
});
