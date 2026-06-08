import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
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
  supportedActions: LivePetVisualAction[];
  supportedExpressions: PetWorldExpression[];
  soundCues: PetWorldSoundCue[];
  defaultSize: "small" | "medium" | "large";
  defaultScale: number;
  preferredSurfaces: PetWorldSurface[];
};

export const littleCatLive2D: Live2DPetConfig = {
  key: "little_cat",
  compatPetKey: "silver_tabby",
  label: "云宠",
  name: "云宠",
  title: "云宠",
  description: "住在小窝里的共享云宠，陪你们互动、送信和记录小事。",
  trait: "唯一共享云宠",
  modelPath: "/live2d/little-cat/LittleCat.model3.json",
  corePath: "/live2d/core/live2dcubismcore.min.js",
  supportedActions: ["idle", "walk", "eat", "pet", "clean", "play", "sleep", "wake", "sad", "happy"],
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
