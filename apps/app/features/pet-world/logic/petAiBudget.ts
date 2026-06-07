import { supabase } from "@/lib/supabase/client";

export const petAiDailyLimit = 12;

const ritualTriggerPatterns = [
  /^letter/,
  /^memory_photo$/,
  /^memory_event$/,
  /^memory_anniversary$/,
  /^today_capsule$/,
  /^partner_online$/,
  /^first_/,
] as const;

export function isPetAiRitualTrigger(triggerType: string) {
  return ritualTriggerPatterns.some((pattern) => pattern.test(triggerType));
}

export function isHighFrequencyPetTrigger(triggerType: string) {
  return (
    triggerType === "pet" ||
    triggerType === "stroke" ||
    triggerType === "tap" ||
    triggerType === "clean" ||
    triggerType === "play" ||
    triggerType === "refresh" ||
    triggerType === "page_change" ||
    triggerType.startsWith("feed")
  );
}

export async function canUsePetAiToday(coupleId: string, limit = petAiDailyLimit) {
  const start = startOfLocalDayIso();
  const { count, error } = await supabase
    .from("pet_ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("couple_id", coupleId)
    .eq("fallback_used", false)
    .gte("created_at", start);

  if (error) {
    return { allowed: false, count: 0, limit, error };
  }

  const used = count ?? 0;
  return { allowed: used < limit, count: used, limit, error: null };
}

function startOfLocalDayIso() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}
