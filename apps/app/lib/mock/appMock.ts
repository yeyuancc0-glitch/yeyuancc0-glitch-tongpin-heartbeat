export const mockCouple = {
  me: {
    name: "我",
    initial: "我",
    mood: "开心",
  },
  partner: {
    name: "TA",
    initial: "T",
    mood: "想见你",
  },
  startedAt: "2026-05-26",
  nextAnniversary: "纪念日还有 0 天",
};

export const mockInteractions = [
  { id: "miss", label: "想你了", tone: "#f8e8ed" },
  { id: "hug", label: "抱抱", tone: "#fff3dc" },
  { id: "close", label: "贴贴", tone: "#eee9f7" },
  { id: "message", label: "自定义互动", tone: "#eef4f6" },
];

export const mockMoods = ["开心", "难过", "想你", "委屈"];

export const mockMoodLabels: Record<string, string> = {
  开心: "今天有一点开心",
  难过: "今天有点难过",
  想你: "今天很想你",
  委屈: "今天有点委屈",
};

export const mockRecentActivity = [
  { id: "a1", title: "你存下了一颗今日胶囊", meta: "今天 13:02" },
  { id: "a2", title: "新增了纪念日：在一起", meta: "12月24日" },
  { id: "a3", title: "对方投递了一句悄悄话", meta: "昨天" },
];

export const mockUpcomingEvents = [
  { id: "e1", title: "在一起", date: "12月24日", type: "纪念日" },
  { id: "e2", title: "周末约会", date: "05月31日", type: "约会" },
];

export const mockEmptyCopy = {
  messages: {
    title: "还没有留言",
    description: "写下第一句话，它会安静放进你们的记忆里。",
  },
  stories: {
    title: "今天的胶囊还空着",
    description: "等一个值得记录的小瞬间，把今天存起来。",
  },
  calendar: {
    title: "还没有记忆胶囊",
    description: "可以先记录一个纪念日、约会或对方生日。",
  },
};

export const mockCalendarDays = Array.from({ length: 35 }, (_, index) => {
  const day = index - 2;
  return {
    id: `d-${index}`,
    label: day > 0 && day <= 30 ? String(day) : "",
    hasEvent: day === 24 || day === 26,
    hasStory: day === 26,
  };
});

export const mockSettings = [
  "个人资料",
  "情侣资料",
  "通知设置",
  "隐私设置",
  "关系设置",
  "反馈入口",
  "关于 App",
];
