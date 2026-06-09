import type { CreationPetStageReaction, CreationLivePetAction, LivePetVisualAction } from "@/features/pet/components/PetStage";
import { activeLive2DPet } from "@/features/pet/live2dCatalog";
import { isDirectPetAction, petAnimalLine, petHumanLine, sanitizeDirectPetText } from "@/features/pet-world/logic/petExpression";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import type { CreationFoodType, CreationPetKey, CreationPuzzle, CreationTownView } from "@/features/home/homeShared";
import type { CreationSpace, PetMemory } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

const petNightSleepStartHour = 23;
const petNightSleepEndHour = 7;
export const petNightResleepDelayMs = 3200;

const legacyPetIdentityPattern = /(迪灵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|短毛猫|金毛|柯基)/g;
const legacyPetInProgressPattern = /(迪灵正在|宠物正在|云宠正在|小狗正在|狗狗正在|小猫正在|猫咪正在)/g;

export const cloudPetCompatPetKey: CreationPetKey = activeLive2DPet.compatPetKey;
export const cloudPetOption = {
  key: cloudPetCompatPetKey,
  name: activeLive2DPet.name,
  title: activeLive2DPet.title,
  description: activeLive2DPet.description,
  trait: activeLive2DPet.trait,
} satisfies {
  key: CreationPetKey;
  name: string;
  title: string;
  description: string;
  trait: string;
};

export const creationPuzzles: CreationPuzzle[] = [
  {
    id: "shadow-window",
    type: "解谜",
    question: "小屋窗边有三样东西：影子、花香、铃声。哪一样最容易被太阳带走？",
    options: ["影子", "花香", "铃声"],
    answer: "影子",
    hint: "太阳变换角度时，它最先移动。",
  },
  {
    id: "brain-door",
    type: "脑筋急转弯",
    question: "什么门永远关不上，却总能让两个人走近一点？",
    options: ["心门", "房门", "车门"],
    answer: "心门",
    hint: "它不在小屋墙上。",
  },
  {
    id: "pet-bowl",
    type: "解谜",
    question: "云宠饭碗里有 2 份粮，又买了 1 份，喂掉 1 份，还剩几份？",
    options: ["1 份", "2 份", "3 份"],
    answer: "2 份",
    hint: "先加，再减。",
  },
];

export function displayPetName(name?: string | null) {
  return name?.trim() || "云宠";
}

export function townViewToPetSurface(view: CreationTownView): PetWorldSurface {
  if (view === "pet") return "pet_room";
  return "creation_hub";
}

export function isPetNightSleepTime(now = new Date()) {
  const hour = now.getHours();
  return hour >= petNightSleepStartHour || hour < petNightSleepEndHour;
}

export function petAwaySurfaceLine(surface: PetWorldSurface) {
  if (surface === "home" || surface === "creation_hub") return "云宠现在在首页附近。";
  if (surface === "share") return "云宠现在在分享页送小提醒。";
  if (surface === "memory") return "云宠现在在记忆页慢慢看。";
  return "云宠现在跑去别处探头。";
}

export function chooseNewerSpace(current: CreationSpace | null, incoming: CreationSpace | null) {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  return incoming.updated_at >= current.updated_at ? incoming : current;
}

export function reactionFromSpace(space: CreationSpace | null): CreationPetStageReaction | null {
  if (!space || !isDirectPetAction(space.current_action)) {
    return null;
  }
  return {
    id: new Date(space.updated_at || space.last_ai_response_at || space.last_interaction_at || space.created_at).getTime(),
    action: space.current_action,
    message: naturalPetMessage(space.last_ai_bubble || space.pet_mood, space.pet_species, "idle", space.current_action),
  };
}

function triggerToAction(triggerType: string): CreationLivePetAction {
  if (triggerType.startsWith("feed")) return "eat";
  if (triggerType === "pet" || triggerType === "stroke" || triggerType === "tap") return "pet";
  if (triggerType === "clean") return "clean";
  if (triggerType === "play") return "play";
  if (triggerType === "footprint_add") return "happy";
  return "idle";
}

export function immediatePetLine(action: LivePetVisualAction) {
  return isDirectPetAction(action) ? petHumanLine(action) : petAnimalLine({ action });
}

function naturalPetMessage(
  raw: string | null | undefined,
  legacySpecies: CreationSpace["pet_species"] | null | undefined,
  triggerType: string,
  action: CreationLivePetAction,
) {
  void legacySpecies;
  const fallback = immediatePetLine(triggerToAction(triggerType) === "idle" ? action : triggerToAction(triggerType));
  if (!isDirectPetAction(action) && triggerToAction(triggerType) === "idle") {
    return petAnimalLine({ action });
  }
  const normalized = sanitizePetIdentityText(raw ?? "")
    .replace(/它/g, "我")
    .replace(/[汪喵]+[,，!！~～]*/g, "")
    .replace(/正在想怎么回应你们。?/g, "我听见你啦")
    .replace(/我还在叼这句话。?/g, "我听见你啦")
    .replace(/[!！~～]+/g, "，")
    .replace(/[。；;]+/g, "")
    .replace(/，{2,}/g, "，")
    .trim();
  const badText = /AI|json|JSON|系统|模型|助手|生成|思考|处理中|请稍候|汪|喵|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话/.test(normalized) || legacyPetIdentityPattern.test(normalized);
  legacyPetIdentityPattern.lastIndex = 0;
  const cleanWrong = (triggerType === "clean" || action === "clean") && /洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛发|毛茸茸|身上|澡/.test(normalized);
  const next = !normalized || badText || cleanWrong ? fallback : sanitizeDirectPetText(normalized, triggerType === "idle" ? action : triggerType);
  return next.slice(0, 8);
}

export function sanitizePetIdentityText(text: string) {
  return text
    .trim()
    .replace(/(?:迪灵|云宠)被打扫得干干净净，?开心地转圈圈[～~。]?/g, "云宠的小窝干净啦")
    .replace(/(?:迪灵|云宠)被打扫得干干净净/g, "云宠的小窝干净啦")
    .replace(/开心地转圈圈[～~。]?/g, "")
    .replace(legacyPetInProgressPattern, "云宠正在")
    .replace(/银纹云猫|奶霜短毛猫|金毛云狗|柯基云狗/g, "云宠")
    .replace(legacyPetIdentityPattern, "云宠")
    .replace(/[汪喵]+[,，!！~～]*/g, "")
    .replace(/洗澡|擦澡|洗完澡|擦完澡|刚擦完/g, "打扫小窝")
    .replace(/毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话/g, "")
    .replace(/云宠被打扫小窝/g, "云宠的小窝被打扫")
    .replace(/云宠云宠/g, "云宠")
    .replace(/，{2,}/g, "，")
    .trim();
}

export function petMemoryTone(type: PetMemory["memory_type"], core: boolean) {
  if (core) {
    return {
      node: colors.accent,
      border: "rgba(184,95,123,0.2)",
      wash: "rgba(255,249,251,0.9)",
      tag: "rgba(215,123,150,0.14)",
    };
  }
  if (type === "footprint") {
    return {
      node: "#8CB7C8",
      border: "rgba(140,183,200,0.22)",
      wash: "rgba(246,252,253,0.9)",
      tag: "rgba(140,183,200,0.14)",
    };
  }
  if (type === "milestone" || type === "event") {
    return {
      node: "#D9A0B1",
      border: "rgba(217,160,177,0.22)",
      wash: "rgba(255,249,251,0.9)",
      tag: "rgba(217,160,177,0.14)",
    };
  }
  if (type === "online_together") {
    return {
      node: "#D7B77F",
      border: "rgba(215,183,127,0.24)",
      wash: "rgba(255,252,244,0.9)",
      tag: "rgba(215,183,127,0.16)",
    };
  }
  return {
    node: "#8EA77D",
    border: "rgba(142,167,125,0.22)",
    wash: "rgba(250,253,247,0.9)",
    tag: "rgba(142,167,125,0.14)",
  };
}

export function petMemoryTypeLabel(type: PetMemory["memory_type"]) {
  if (type === "footprint") {
    return "足迹";
  }
  if (type === "milestone") {
    return "纪念";
  }
  if (type === "online_together") {
    return "同屏";
  }
  if (type === "event") {
    return "小事";
  }
  if (type === "preference") {
    return "偏好";
  }
  return "照顾";
}

export function petMemorySummaryText(summary: string) {
  if (/被打扫得干干净净|开心地转圈圈|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光/.test(summary)) {
    return "云宠的小窝干净啦";
  }
  const cleaned = sanitizePetIdentityText(summary)
    .replace(/[。；;]+$/g, "")
    .trim();
  return cleaned || "小屋里多了一条记忆";
}

export function isMeaningfulPetMemory(memory: PetMemory) {
  const summary = memory.summary.trim();
  const renderedSummary = petMemorySummaryText(summary).trim();
  if (!summary || /^(喵|喵呜|呼噜|咕噜|\.{1,3}|…{1,3}|🐾)$/.test(summary) || /^(喵|喵呜|呼噜|咕噜|\.{1,3}|…{1,3}|🐾)$/.test(renderedSummary)) {
    return false;
  }
  if (memory.memory_scope === "core") {
    return true;
  }
  if (memory.memory_type === "footprint" || memory.memory_type === "milestone" || memory.memory_type === "event" || memory.memory_type === "online_together") {
    return true;
  }
  return memory.memory_type === "care_summary" && memory.importance >= 70 && summary.length >= 6;
}

export function creationFoodLabel(foodType: CreationFoodType) {
  return foodType === "premium" ? "鲜食粮" : "日常粮";
}

export function creationFoodErrorMessage(message: string) {
  if (message.includes("food_inventory_empty")) return "粮仓里没有这类粮了，可以先去解谜赚奖励再购买。";
  if (message.includes("insufficient_treat_balance")) return "奖励点数还不够，先去解一道题赚点口粮。";
  return message;
}

export function creationGameErrorMessage(message: string) {
  if (message.includes("puzzle_reward_already_claimed_today")) return "这道题今天已经领取过奖励了，换一题继续挑战。";
  if (message.includes("puzzle_not_solved")) return "答对后才能领取奖励。";
  return message;
}

export function petActionToastTitle(type: "pet" | "clean" | "play" | "sleep") {
  if (type === "pet") return "已摸摸云宠";
  if (type === "play") return "已陪云宠玩";
  if (type === "sleep") return "已哄云宠休息";
  return "小屋已清洁";
}
