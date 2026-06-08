import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera } from "lucide-react-native";

import { AppTextInput, Card, PrimaryButton, SecondaryButton, TopBar } from "@/components/app-ui/AppUI";
import { DateField, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/database.types";
import { buildStoragePath, buildThumbnailStoragePath, createImageThumbnail, createSignedUrl, isSupportedImage, storageBuckets, uploadImage } from "@/lib/supabase/storage";
import { colors } from "@/styles/theme";

export function ProfileScreen({ onSaved, onCancel, embedded = false }: { onSaved?: () => void; onCancel?: () => void; embedded?: boolean }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [loveStartDate, setLoveStartDate] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarThumbnailPath, setAvatarThumbnailPath] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data);
        setDisplayName(data?.display_name ?? user.user_metadata.display_name ?? "");
        setBirthdate(data?.birthdate ?? "");
        setAvatarPath(data?.avatar_url ?? null);
        setAvatarThumbnailPath(data?.avatar_thumbnail_url ?? null);
        if (data?.avatar_url) {
          createSignedUrl(storageBuckets.avatars, data.avatar_thumbnail_url ?? data.avatar_url).then(setAvatarPreviewUrl);
        }
      });

    // 获取当前的情侣恋爱开始日期（如有活跃情侣关系）
    supabase
      .from("couples")
      .select("started_at")
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.started_at) {
          setLoveStartDate(data.started_at);
        } else {
          // 如果没有情侣关系，检查 localStorage 暂存的恋爱开始日期
          if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
            const temp = window.localStorage.getItem("temp_love_start_date");
            if (temp) {
              setLoveStartDate(temp);
            }
          }
        }
      });
  }, [user]);

  async function pickAvatar() {
    if (!user) {
      return;
    }
    if (Platform.OS !== "web") {
      showToast({ title: "当前端暂不支持", message: "头像上传先在 Web MVP 中开放。", tone: "info" });
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      if (!isSupportedImage(file, 4 * 1024 * 1024)) {
        showToast({ title: "头像格式不支持", message: "请上传 4MB 以内的 JPG、PNG、WebP 或 GIF 图片。", tone: "error" });
        return;
      }

      setUploadingAvatar(true);
      const path = buildStoragePath([user.id], file.type);
      const { error: uploadError } = await uploadImage(storageBuckets.avatars, path, file);
      if (uploadError) {
        setUploadingAvatar(false);
        showToast({ title: "头像上传失败", message: uploadError.message, tone: "error" });
        return;
      }

      const thumbnailFile = await createImageThumbnail(file, 220, 0.76);
      let thumbnailPath = thumbnailFile ? buildThumbnailStoragePath(path) : null;

      const updatePayload = { avatar_url: path, avatar_thumbnail_url: thumbnailPath, updated_at: new Date().toISOString() };
      let { error: profileError } = await supabase.from("profiles").update(updatePayload).eq("id", user.id);
      if (profileError && thumbnailPath && /avatar_thumbnail_url|schema cache|column/i.test(profileError.message)) {
        const fallbackPayload = { avatar_url: path, updated_at: updatePayload.updated_at };
        const fallbackResult = await supabase.from("profiles").update(fallbackPayload).eq("id", user.id);
        profileError = fallbackResult.error;
        if (!profileError) {
          thumbnailPath = null;
        }
      }
      setUploadingAvatar(false);
      if (profileError) {
        await supabase.storage.from(storageBuckets.avatars).remove([path]);
        showToast({ title: "头像保存失败", message: profileError.message, tone: "error" });
        return;
      }
      if (thumbnailFile && thumbnailPath) {
        const { error: thumbnailUploadError } = await uploadImage(storageBuckets.avatars, thumbnailPath, thumbnailFile);
        if (thumbnailUploadError) {
          console.warn("Avatar thumbnail upload failed:", thumbnailUploadError.message);
          await supabase.from("profiles").update({ avatar_thumbnail_url: null }).eq("id", user.id);
          thumbnailPath = null;
        }
      }

      if (avatarPath) {
        const oldPaths = [avatarPath, avatarThumbnailPath].filter((path): path is string => Boolean(path));
        await supabase.storage.from(storageBuckets.avatars).remove(oldPaths);
      }
      setAvatarPath(path);
      setAvatarThumbnailPath(thumbnailPath);
      setAvatarPreviewUrl(URL.createObjectURL(file));
      showToast({ title: "头像已更新", tone: "success" });
    };
    input.click();
  }

  async function removeAvatar() {
    if (!user || !avatarPath) {
      return;
    }
    setUploadingAvatar(true);
    let { error } = await supabase.from("profiles").update({ avatar_url: null, avatar_thumbnail_url: null, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (error && /avatar_thumbnail_url|schema cache|column/i.test(error.message)) {
      const fallbackResult = await supabase.from("profiles").update({ avatar_url: null, updated_at: new Date().toISOString() }).eq("id", user.id);
      error = fallbackResult.error;
    }
    if (!error) {
      const pathsToRemove = [avatarPath, avatarThumbnailPath].filter((path): path is string => Boolean(path));
      await supabase.storage.from(storageBuckets.avatars).remove(pathsToRemove);
    }
    setUploadingAvatar(false);
    if (error) {
      showToast({ title: "移除头像失败", message: error.message, tone: "error" });
      return;
    }
    setAvatarPath(null);
    setAvatarThumbnailPath(null);
    setAvatarPreviewUrl(null);
    showToast({ title: "头像已移除", tone: "success" });
  }

  async function saveProfile() {
    if (!user) {
      return;
    }

    setBusy(true);
    const savedAt = new Date().toISOString();
    const upsertPayload = {
      id: user.id,
      display_name: displayName.trim() || user.email?.split("@")[0] || "未命名",
      avatar_url: avatarPath,
      avatar_thumbnail_url: avatarThumbnailPath,
      birthdate: birthdate.trim() || null,
      updated_at: savedAt,
    };
    let { error } = await supabase.from("profiles").upsert(upsertPayload);
    if (error && /avatar_thumbnail_url|schema cache|column/i.test(error.message)) {
      const fallbackPayload = { ...upsertPayload };
      delete (fallbackPayload as Partial<typeof upsertPayload>).avatar_thumbnail_url;
      const fallbackResult = await supabase.from("profiles").upsert(fallbackPayload);
      error = fallbackResult.error;
    }

    if (error) {
      setBusy(false);
      showToast({ title: "保存失败", message: error.message, tone: "error" });
      return;
    }

    let dateMessage = "";
    if (loveStartDate) {
      // 暂存到本地，用于没有绑定时流转到 PairingScreen
      if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("temp_love_start_date", loveStartDate);
      }

      // 如果已有活跃的情侣关系，直接通过 RPC 同步更新情侣表的 started_at
      const { data: coupleData } = await supabase
        .from("couples")
        .select("id, started_at")
        .eq("status", "active")
        .maybeSingle();

      if (coupleData) {
        if (coupleData.started_at !== loveStartDate) {
          const { error: coupleError } = await supabase.rpc("update_active_couple_dates", {
            relationship_started_at: loveStartDate,
          });
          if (coupleError) {
            console.warn("Update couple date error:", coupleError);
          } else {
            dateMessage = "恋爱开始日期已同步更新。";
          }
        } else {
          dateMessage = "恋爱开始日期已保存。";
        }
      } else {
        dateMessage = "恋爱开始日期已暂存，绑定后将自动同步。";
      }
    } else {
      if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("temp_love_start_date");
      }
    }

    setBusy(false);
    showToast({
      title: "资料已保存",
      message: dateMessage || "下一步可以绑定另一半。",
      tone: "success",
    });
    onSaved?.();
  }

  return (
    <View style={styles.wrap}>
      {embedded ? null : <TopBar title={profile ? "完善资料" : "先认识一下你"} subtitle="头像和昵称会展示给另一半。" />}
      <Card>
        <Pressable accessibilityRole="button" accessibilityLabel="上传头像" onPress={pickAvatar} style={styles.avatarUpload}>
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
        </Pressable>
        {avatarPath ? <SecondaryButton label="移除头像" onPress={removeAvatar} danger loading={uploadingAvatar} /> : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>昵称</Text>
          <AppTextInput value={displayName} onChangeText={setDisplayName} placeholder="你的昵称" style={styles.creamInput} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>生日（可选）</Text>
          <DateField value={birthdate} onChangeText={setBirthdate} placeholder="选择生日" style={styles.creamInput} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>恋爱开始日期（可选）</Text>
          <DateField value={loveStartDate} onChangeText={setLoveStartDate} placeholder="选择日期" style={styles.creamInput} />
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
});
