// Store days always follow India time, wherever the server runs.
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const todayIST = () => dayKey.format(new Date());

export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, by: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

export const formatDay = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));

export type DayReportData = {
  date: string;
  entries: number;
  people: string[];
  items: {
    itemId: string;
    name: string;
    category: string;
    uom: string;
    used: number;
    uses: { person: string; qty: number; at: string; note: string }[];
  }[];
};
