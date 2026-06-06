import { supabase } from "@/lib/supabase/client";

export async function flushPushNotifications() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return;
  }

  const { error } = await supabase.functions.invoke("send-push-notifications", {
    body: {},
  });

  if (error) {
    console.warn("Push delivery flush failed:", error.message);
  }
}
