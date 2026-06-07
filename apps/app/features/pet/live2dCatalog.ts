import type { CreationLivePetAction } from "@/features/pet/components/PetStage";
import type { PetWorldExpression, PetWorldSoundCue, PetWorldSurface } from "@/features/pet/services/petAiBrain";
import type { CreationSpace } from "@/lib/supabase/database.types";

export type Live2DPetKey = "little_cat";

export type Live2DPetConfig = {
  key: Live2DPetKey;
  compatPetKey: CreationSpace["pet_key"];
  label: string;
  name: string;
  title: string;
  description: string;
  trait: string;
  modelPath: string;
  corePath: string;
  supportedActions: CreationLivePetAction[];
  supportedExpressions: PetWorldExpression[];
  soundCues: PetWorldSoundCue[];
  defaultSize: "small" | "medium" | "large";
  defaultScale: number;
  preferredSurfaces: PetWorldSurface[];
};

export const littleCatLive2D: Live2DPetConfig = {
  key: "little_cat",
  compatPetKey: "silver_tabby",
  label: "LittleCat",
  name: "小猫",
  title: "Live2D 小猫",
  description: "LittleCat 模型驱动的共享小猫，第一版先住在小窝里陪你们互动。",
  trait: "唯一共享小猫",
  modelPath: "/live2d/little-cat/LittleCat.model3.json",
  corePath: "/live2d/core/live2dcubismcore.min.js",
  supportedActions: ["idle", "walk", "eat", "pet", "clean", "play", "sleep", "sad", "happy"],
  supportedExpressions: ["happy", "curious", "sleepy", "lonely", "excited", "calm", "hungry", "soft", "shy"],
  soundCues: ["none", "soft_chime", "purr", "tap", "letter", "photo"],
  defaultSize: "medium",
  defaultScale: 1,
  preferredSurfaces: ["pet_room", "home", "share", "memory", "creation_hub"],
};

export const live2dPetCatalog = {
  little_cat: littleCatLive2D,
} satisfies Record<Live2DPetKey, Live2DPetConfig>;

export const activeLive2DPet = littleCatLive2D;
