import type { ImageSourcePropType } from "react-native";

import { capsuleIcons } from "@/features/home/homeAssets";
import { moodLabels } from "@/lib/constants/appContent";
import type { Checkin } from "@/lib/supabase/database.types";

type CapsuleIconMatch = { label: string; image: ImageSourcePropType; keywords: string[] };

function storyIconMatchFromText(text: string): CapsuleIconMatch {
  const normalized = text.replace(/\s/g, "");
  const groups: CapsuleIconMatch[] = [
    { label: "奶茶", image: capsuleIcons.milkTea, keywords: ["奶茶", "珍珠", "波霸", "啵啵", "咖啡", "拿铁", "可可", "饮料", "喝了"] },
    { label: "吃饭", image: capsuleIcons.meal, keywords: ["吃饭", "晚饭", "午饭", "早餐", "火锅", "烧烤", "面", "米饭", "餐厅", "好吃", "甜品", "蛋糕", "布丁", "冰淇淋", "糖", "巧克力"] },
    { label: "电影", image: capsuleIcons.movie, keywords: ["电影", "影院", "追剧", "看剧", "综艺", "电视剧"] },
    { label: "散步", image: capsuleIcons.walk, keywords: ["散步", "走路", "压马路", "逛街", "公园"] },
    { label: "花", image: capsuleIcons.flower, keywords: ["花", "玫瑰", "花束", "花店"] },
    { label: "抱抱", image: capsuleIcons.hug, keywords: ["抱", "拥抱", "贴贴", "亲亲"] },
    { label: "想你", image: capsuleIcons.miss, keywords: ["想你", "想TA", "想他", "想她", "晚安", "月亮"] },
    { label: "留言", image: capsuleIcons.note, keywords: ["留言", "写信", "信", "悄悄话", "想说"] },
    { label: "礼物", image: capsuleIcons.gift, keywords: ["礼物", "惊喜", "快递", "纪念品"] },
    { label: "拍照", image: capsuleIcons.photo, keywords: ["拍照", "照片", "合照", "自拍"] },
    { label: "音乐", image: capsuleIcons.music, keywords: ["音乐", "听歌", "唱歌", "演唱会"] },
    { label: "工作", image: capsuleIcons.work, keywords: ["上班", "加班", "工作", "开会", "学习", "上课", "考试", "读书", "作业"] },
    { label: "在家", image: capsuleIcons.home, keywords: ["回家", "在家", "做饭", "家里"] },
    { label: "旅行", image: capsuleIcons.travel, keywords: ["旅行", "旅游", "出发", "高铁", "飞机", "酒店", "海边", "看海"] },
    { label: "身体", image: capsuleIcons.health, keywords: ["生病", "感冒", "发烧", "药", "医院", "不舒服"] },
    { label: "云宠", image: capsuleIcons.pet, keywords: ["云宠", "迪灵", "心愿精灵", "精灵", "小窝"] },
  ];
  return groups.find((group) => group.keywords.some((keyword) => normalized.includes(keyword))) ?? { label: "日常", image: capsuleIcons.daily, keywords: [] };
}

export function storyIconImageFromText(text: string) {
  return storyIconMatchFromText(text).image;
}

export function storyIconLabelFromText(text: string) {
  return storyIconMatchFromText(text).label;
}

export function splitStory(content?: string | null) {
  if (!content) {
    return { mood: "", iconImage: capsuleIcons.daily, iconLabel: "日常", body: "分享了今天的一句话" };
  }
  const [maybeMood, ...rest] = content.split("｜");
  if (rest.length === 0) {
    return { mood: "", iconImage: storyIconImageFromText(content), iconLabel: storyIconLabelFromText(content), body: content };
  }
  const body = rest.length > 1 ? rest.slice(1).join("｜") : rest.join("｜");
  return {
    mood: moodLabels[maybeMood] ?? maybeMood,
    iconImage: storyIconImageFromText(body),
    iconLabel: storyIconLabelFromText(body),
    body,
  };
}

export function checkinPhotoCaption(checkin: Pick<Checkin, "id">) {
  return `今日胶囊图片:${checkin.id}`;
}
