import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import { Body, Button, Field, H1, Label, Panel } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/database.types";

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function ProfileScreen({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
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
      });
  }, [user]);

  async function saveProfile() {
    if (!user) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim() || user.email?.split("@")[0] || "未命名",
      birthdate: birthdate.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);

    if (error) {
      notify("保存失败", error.message);
      return;
    }

    onSaved?.();
  }

  return (
    <Panel style={styles.panel}>
      <H1 style={styles.title}>{profile ? "个人资料" : "先设置你的资料"}</H1>
      <Body>昵称会展示给另一半。生日可先不填，V0.1A 不会用于公开展示。</Body>
      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Label>昵称</Label>
          <Field value={displayName} onChangeText={setDisplayName} placeholder="你的昵称" />
        </View>
        <View style={styles.fieldGroup}>
          <Label>生日（可选）</Label>
          <Field value={birthdate} onChangeText={setBirthdate} placeholder="YYYY-MM-DD" />
        </View>
        <Button label="保存资料" onPress={saveProfile} disabled={busy || !displayName.trim()} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  form: {
    gap: 14,
  },
  fieldGroup: {
    gap: 7,
  },
});
