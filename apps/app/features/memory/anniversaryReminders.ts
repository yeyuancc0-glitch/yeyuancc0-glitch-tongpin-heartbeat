import { addDays, localIsoDate, todayIsoDate } from "@/lib/dates/date";

export type AnniversaryReminderKind = "milestone" | "festival";

export type AnniversaryReminder = {
  id: string;
  title: string;
  date: string;
  kind: AnniversaryReminderKind;
  description: string;
  daysUntil: number;
  badge: string;
};

const upcomingReminderWindowDays = 45;
const dayMilestones = [
  { days: 100, title: "相爱 100 天", badge: "100" },
  { days: 200, title: "相爱 200 天", badge: "200" },
  { days: 300, title: "相爱 300 天", badge: "300" },
  { days: 520, title: "相爱 520 天", badge: "520" },
  { days: 999, title: "相爱 999 天", badge: "999" },
  { days: 1000, title: "相爱 1000 天", badge: "1K" },
  { days: 1314, title: "相爱 1314 天", badge: "1314" },
  { days: 2000, title: "相爱 2000 天", badge: "2K" },
  { days: 3000, title: "相爱 3000 天", badge: "3K" },
];

const fixedFestivals = [
  { month: 2, day: 14, title: "情人节", badge: "2.14", description: "今天适合把喜欢说得更认真一点。" },
  { month: 5, day: 20, title: "520", badge: "520", description: "今天适合把爱意发给 TA。" },
];
const qixiFallbackByYear: Record<number, string> = {
  2024: "2024-08-10",
  2025: "2025-08-29",
  2026: "2026-08-19",
  2027: "2027-08-08",
  2028: "2028-08-26",
  2029: "2029-08-16",
  2030: "2030-08-05",
  2031: "2031-08-24",
  2032: "2032-08-12",
  2033: "2033-08-01",
  2034: "2034-08-20",
  2035: "2035-08-10",
};

function parseIsoDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonthsClamped(date: Date, months: number) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(date.getDate(), lastDay));
}

function daysBetweenDateKeys(start: string, end: string) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return 0;
  }
  const diff = endDate.getTime() - startDate.getTime();
  return Math.round(diff / 86_400_000);
}

function fixedDate(year: number, month: number, day: number) {
  return localIsoDate(new Date(year, month - 1, day));
}

function qixiDate(year: number) {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    });
    for (let month = 6; month <= 8; month += 1) {
      const monthEnd = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= monthEnd; day += 1) {
        const date = new Date(year, month, day);
        const parts = formatter.formatToParts(date);
        const lunarMonth = parts.find((part) => part.type === "month")?.value;
        const lunarDay = Number(parts.find((part) => part.type === "day")?.value);
        if (lunarMonth === "七月" && lunarDay === 7) {
          return localIsoDate(date);
        }
      }
    }
  } catch {
    return qixiFallbackByYear[year] ?? null;
  }
  return qixiFallbackByYear[year] ?? null;
}

function describeMilestone(title: string, daysUntil: number) {
  if (daysUntil === 0) {
    return `${title}就是今天。`;
  }
  if (daysUntil > 0) {
    return `还有 ${daysUntil} 天到 ${title}。`;
  }
  return `${title}已经被你们走过了。`;
}

function withComputedFields(input: Omit<AnniversaryReminder, "daysUntil">, today: string): AnniversaryReminder {
  return {
    ...input,
    daysUntil: daysBetweenDateKeys(today, input.date),
  };
}

export function generateAnniversaryReminders(startedAt?: string | null, today = todayIsoDate()) {
  const todayDate = parseIsoDate(today) ?? new Date();
  const startDate = parseIsoDate(startedAt);
  const startKey = startDate ? localIsoDate(startDate) : null;
  const reminders: AnniversaryReminder[] = [];

  if (startDate && startKey) {
    for (const milestone of dayMilestones) {
      const date = localIsoDate(addDays(startDate, milestone.days - 1));
      reminders.push(withComputedFields({
        id: `milestone-day-${milestone.days}`,
        title: milestone.title,
        date,
        kind: "milestone",
        badge: milestone.badge,
        description: describeMilestone(milestone.title, daysBetweenDateKeys(today, date)),
      }, today));
    }

    const halfYearDate = localIsoDate(addMonthsClamped(startDate, 6));
    reminders.push(withComputedFields({
      id: "milestone-half-year",
      title: "相爱半年",
      date: halfYearDate,
      kind: "milestone",
      badge: "半年",
      description: describeMilestone("相爱半年", daysBetweenDateKeys(today, halfYearDate)),
    }, today));

    const yearsSinceStart = Math.max(1, todayDate.getFullYear() - startDate.getFullYear() + 2);
    for (let year = 1; year <= Math.min(50, yearsSinceStart + 20); year += 1) {
      const date = localIsoDate(addMonthsClamped(startDate, year * 12));
      reminders.push(withComputedFields({
        id: `milestone-year-${year}`,
        title: `相爱 ${year} 周年`,
        date,
        kind: "milestone",
        badge: `${year}年`,
        description: describeMilestone(`相爱 ${year} 周年`, daysBetweenDateKeys(today, date)),
      }, today));
    }
  }

  const festivalStartYear = Math.min(startDate?.getFullYear() ?? todayDate.getFullYear(), todayDate.getFullYear()) - 5;
  const festivalEndYear = todayDate.getFullYear() + 20;
  for (let year = festivalStartYear; year <= festivalEndYear; year += 1) {
    for (const festival of fixedFestivals) {
      const date = fixedDate(year, festival.month, festival.day);
      reminders.push(withComputedFields({
        id: `festival-${festival.month}-${festival.day}-${year}`,
        title: festival.title,
        date,
        kind: "festival",
        badge: festival.badge,
        description: festival.description,
      }, today));
    }
    const qixi = qixiDate(year);
    if (qixi) {
      reminders.push(withComputedFields({
        id: `festival-qixi-${year}`,
        title: "七夕",
        date: qixi,
        kind: "festival",
        badge: "七夕",
        description: "今天是属于两个人的小小银河日。",
      }, today));
    }
  }

  return reminders
    .filter((reminder, index, list) => index === list.findIndex((item) => item.id === reminder.id))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function upcomingAnniversaryReminders(reminders: AnniversaryReminder[], limit = 3) {
  return reminders
    .filter((reminder) => reminder.daysUntil >= 0 && reminder.daysUntil <= upcomingReminderWindowDays)
    .sort((left, right) => left.daysUntil - right.daysUntil || left.date.localeCompare(right.date))
    .slice(0, limit);
}
