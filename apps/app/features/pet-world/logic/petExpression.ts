import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
import type { PetWorldDecision, PetWorldIntent } from "@/features/pet/services/petAiBrain";

export type PetExpressionMode = "animal" | "human";

export function petExpressionModeForTrigger(triggerType: string) {
  return isDirectPetInteractionTrigger(triggerType) ? "human" : "animal";
}

export function isDirectPetInteractionTrigger(triggerType: string) {
  return /^(pet|stroke|tap|feed|clean|play|sleep|summon|find|found|drag|drop|memory_tap|prop_tap)/.test(triggerType);
}

export function isDirectPetAction(action: LivePetVisualAction | null | undefined) {
  return action === "eat" || action === "pet" || action === "clean" || action === "play" || action === "sleep";
}

export function petHumanLine(actionOrTrigger: LivePetVisualAction | string | null | undefined) {
  const value = String(actionOrTrigger ?? "idle");
  if (value.startsWith("feed") || value === "eat") return "饭饭";
  if (value === "pet" || value === "stroke" || value === "tap") return "摸头，舒服";
  if (value === "clean") return "干净啦";
  if (value === "play") return "再追一下";
  if (value === "sleep") return "困困";
  if (value === "wake" || value === "awake") return "醒啦";
  if (value === "drag" || value === "drop") return "这里也可以";
  if (value === "summon" || value === "find" || value === "found") return "找到啦";
  if (value === "memory_tap" || value === "prop_tap") return "这个，记得";
  return "喵";
}

export function petAnimalLine(input: {
  triggerType?: string;
  intent?: PetWorldIntent;
  prop?: PetWorldDecision["prop"];
  symbol?: PetWorldDecision["symbol"];
  action?: LivePetVisualAction | null;
  surface?: string;
} = {}) {
  const trigger = input.triggerType ?? "";
  if (input.prop === "letter" || trigger.includes("letter")) return "喵呜";
  if (input.prop === "photo" || input.symbol === "photo" || trigger.includes("photo")) return "...";
  if (input.prop === "memory" || input.symbol === "memory" || trigger.includes("memory") || trigger.includes("capsule")) return "咕噜";
  if (input.symbol === "sleep" || input.intent === "rest" || input.action === "sleep") return "呼噜";
  if (input.symbol === "heart" || trigger.includes("partner_online")) return "咕噜";
  if (input.intent === "hide" || input.intent === "return_home") return "喵";
  if (input.intent === "ask_food" || input.action === "sad") return "喵呜";
  return "喵";
}

export function petLineForMode(input: {
  mode: PetExpressionMode;
  triggerType?: string;
  action?: LivePetVisualAction | null;
  intent?: PetWorldIntent;
  prop?: PetWorldDecision["prop"];
  symbol?: PetWorldDecision["symbol"];
  fallback?: string | null;
}) {
  if (input.mode === "human") {
    return petHumanLine(input.triggerType || input.action);
  }
  return petAnimalLine(input);
}

export function sanitizePassivePetText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) {
    return null;
  }
  if (isAnimalExpression(text)) {
    return text.slice(0, 8);
  }
  return null;
}

export function sanitizeDirectPetText(value: string | null | undefined, actionOrTrigger: LivePetVisualAction | string | null | undefined) {
  const text = value?.trim().replace(/[。；;!！~～]+/g, "").replace(/\s+/g, "");
  if (!text) {
    return petHumanLine(actionOrTrigger);
  }
  if (isAnimalExpression(text)) {
    return text.slice(0, 8);
  }
  if (/[我你他她它们]|分享页|记忆页|首页|小窝|胶囊|信|照片|陪你们|靠近|这里等|正在|帮你|替你|回来|过去|路过|看看/.test(text)) {
    return petHumanLine(actionOrTrigger);
  }
  return text.slice(0, 8);
}

function isAnimalExpression(value: string) {
  return /^(喵|喵呜|呼噜|咕噜|\.\.\.|…|🐾|💕|💤|💌|📷✨|✨)+$/.test(value.trim());
}
