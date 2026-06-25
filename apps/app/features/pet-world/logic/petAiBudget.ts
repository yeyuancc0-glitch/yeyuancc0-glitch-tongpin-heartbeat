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
  void coupleId;
  return { allowed: false, count: 0, limit, error: null };
}
