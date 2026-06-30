import type { ImageSourcePropType } from "react-native";

import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import type { CreationSpace } from "@/lib/supabase/database.types";

export type SettingPage = "profile" | "couple" | "pet" | "notifications" | "privacy" | "relationship" | "feedback" | "about";
export type SubPage = "main" | "pairing" | "messages" | "addEvent" | "writeLetter" | "letterInbox" | "creation" | SettingPage;
export type QuickInteractionItem = { id: string; label: string; tone: string; icon?: ImageSourcePropType };
export type NotificationPreferenceToggleKey =
  | "push_enabled"
  | "message_enabled"
  | "interaction_enabled"
  | "checkin_enabled"
  | "letter_enabled"
  | "calendar_enabled"
  | "quiet_hours_enabled";
export type CreationPetKey = CreationSpace["pet_key"];
export type CreationFoodType = "basic" | "premium";
export type CreationTownView = "hub" | "pet" | "footprints" | "playground";
export type VisiblePetSurface = Extract<PetWorldSurface, "home" | "share" | "memory">;
export type CreationRewardKind = "footprint" | "puzzle" | "feed" | "food";
export type CreationRewardFlash = {
  id: number;
  kind: CreationRewardKind;
  title: string;
  message: string;
};
export type CreationPuzzle = {
  id: string;
  type: "解谜" | "脑筋急转弯";
  question: string;
  options: string[];
  answer: string;
  hint: string;
};
export type PhotoUploadOptions = {
  caption?: string;
  currentCount?: number;
  maxFiles?: number;
  successTitle?: string;
  successMessage?: string;
};
export type PhotoFileList = File[] | FileList;
export type PhotoUploadResult = {
  uploadedCount: number;
  uploadedFiles: File[];
  failedFiles: File[];
};
export type PhotoPreviewState = {
  id: string;
  index: number;
};
export type PetSpeciesCompat = CreationSpace["pet_species"];
