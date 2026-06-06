import type { CreationLivePetAction } from "@/features/pet/components/PetStage";
import type { CreationAction, CreationSpace } from "@/lib/supabase/database.types";

export type PetMoodRuleInput = {
  space: CreationSpace | null;
  partnerOnline?: boolean;
};

export function petBubbleForState({ space, partnerOnline }: PetMoodRuleInput) {
  if (!space) {
    return "等你们一起把小窝打开";
  }
  if (partnerOnline) {
    return "你们都回来啦";
  }
  if (space.fullness < 28) {
    return "我有点饿啦";
  }
  if (space.energy < 24) {
    return "困困，想趴一会儿";
  }
  if (space.cleanliness < 30) {
    return "想把小窝擦亮";
  }
  if (space.affection >= 82) {
    return "今天也贴着你们";
  }
  return space.pet_mood || "正在小屋里慢慢待着";
}

export function petActionForState(space: CreationSpace | null, partnerOnline?: boolean): CreationLivePetAction {
  if (!space) {
    return "idle";
  }
  if (partnerOnline) {
    return "happy";
  }
  if (space.current_action && space.current_action !== "idle" && space.current_action !== "walk") {
    return space.current_action;
  }
  if (space.fullness < 24 || space.cleanliness < 24) {
    return "sad";
  }
  if (space.energy < 20) {
    return "sleep";
  }
  return "idle";
}

export function todayPetCareCount(actions: CreationAction[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return actions.filter((action) => {
    if (!["feed", "pet", "clean", "play"].includes(action.action_type)) {
      return false;
    }
    return action.created_at.slice(0, 10) === today;
  }).length;
}

export function petCareSummary(actions: CreationAction[]) {
  const count = todayPetCareCount(actions);
  if (count === 0) {
    return "今天还没照顾";
  }
  return `今日照顾 ${count} 次`;
}
