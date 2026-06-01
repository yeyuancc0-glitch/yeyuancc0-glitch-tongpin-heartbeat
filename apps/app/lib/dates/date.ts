export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(startIsoDate: string, end = new Date()) {
  const start = new Date(`${startIsoDate}T00:00:00`);
  const finish = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = finish.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000) + 1);
}

export function daysUntilNextAnniversary(anniversaryDate?: string | null) {
  if (!anniversaryDate) {
    return null;
  }

  const now = new Date();
  const source = new Date(`${anniversaryDate}T00:00:00`);
  let next = new Date(now.getFullYear(), source.getMonth(), source.getDate());

  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear() + 1, source.getMonth(), source.getDate());
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((next.getTime() - today.getTime()) / 86_400_000);
}

export function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
