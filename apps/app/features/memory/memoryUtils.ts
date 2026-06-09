import type { ImageSourcePropType } from "react-native";

import type { LetterPreview, MediaFile } from "@/lib/supabase/database.types";

export const maxMemoryPhotos = 10;

export type MemoryFilter = "全部" | "日常" | "留言" | "纪念日" | "相册" | "信件";

export type MemoryTimelineItem = {
  id: string;
  date: string;
  sortDate: string;
  title: string;
  body: string;
  tag: string;
  filter: MemoryFilter;
  imageTone: string;
  imageLabel: string;
  iconImage?: ImageSourcePropType;
  imageUrl?: string | null;
  photos: MediaFile[];
  letter?: LetterPreview;
  deleteAction?: {
    table: "checkins" | "calendar_events" | "media_files" | "future_letters" | "couple_footprints";
    id: string;
    storagePath?: string;
  };
};

export function formatMemoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replaceAll("-", ".");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
