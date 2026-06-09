export const quickInteractionPresets = [
  { id: "miss", label: "想你了", tone: "#f8e8ed" },
  { id: "hug", label: "抱抱", tone: "#fff3dc" },
  { id: "close", label: "贴贴", tone: "#eee9f7" },
  { id: "message", label: "自定义互动", tone: "#eef4f6" },
];

export const moodOptions = ["开心", "难过", "想你", "委屈"];

export const moodLabels: Record<string, string> = {
  开心: "今天有一点开心",
  难过: "今天有点难过",
  想你: "今天很想你",
  委屈: "今天有点委屈",
};

export const emptyCopy = {
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
