export type Live2DPetKey = "little_cat";

export type Live2DPetConfig = {
  key: Live2DPetKey;
  label: string;
  modelPath: string;
  corePath: string;
};

export const littleCatLive2D: Live2DPetConfig = {
  key: "little_cat",
  label: "LittleCat",
  modelPath: "/live2d/little-cat/LittleCat.model3.json",
  corePath: "/live2d/core/live2dcubismcore.min.js",
};

export const live2dPetCatalog = {
  little_cat: littleCatLive2D,
} satisfies Record<Live2DPetKey, Live2DPetConfig>;
