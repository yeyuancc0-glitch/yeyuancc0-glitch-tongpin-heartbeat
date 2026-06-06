export type CreationLivePetAction = "idle" | "walk" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy";

export type CreationPetStageReaction = {
  id: number;
  action: CreationLivePetAction;
  message: string;
};

export type PetStageMode = "home" | "room";

export type PetStageProps = Record<string, unknown>;

export function PetStage(_props: PetStageProps) {
  return null;
}
