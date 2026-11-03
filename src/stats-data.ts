export interface FocusRecord {
  id: string;
  endedAt: number;
  minutes: number;
  task: string;
  segments: { start: number; end: number }[];
}
export type Period = "Day" | "Week" | "Month" | "Year";
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function periodDays(anchor: Date, period: Period): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (period === "Week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === "Month") start.setDate(1);
  if (period === "Year") start.setMonth(0, 1);
  const end = new Date(start);
  if (period === "Day") end.setDate(end.getDate() + 1);
  if (period === "Week") end.setDate(end.getDate() + 7);
  if (period === "Month") end.setMonth(end.getMonth() + 1);
  if (period === "Year") end.setFullYear(end.getFullYear() + 1);
  const days: Date[] = [];
  for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}
export function shiftPeriod(anchor: Date, period: Period, delta: number) {
  const d = periodDays(anchor, period)[0];
  if (period === "Year") d.setFullYear(d.getFullYear() + delta);
  else if (period === "Month") d.setMonth(d.getMonth() + delta);
  else d.setDate(d.getDate() + delta * (period === "Week" ? 7 : 1));
  return d;
}
export function hourlyMinutes(records: FocusRecord[], from: Date, until: Date) {
  const hours = Array<number>(24).fill(0);
  for (const record of records) for (const segment of record.segments) {
    let cursor = Math.max(segment.start, from.getTime());
    const end = Math.min(segment.end, until.getTime());
    while (cursor < end) {
      const date = new Date(cursor);
      const boundary = new Date(cursor); boundary.setMinutes(60, 0, 0);
      const next = Math.min(end, boundary.getTime());
      if (next <= cursor) break;
      hours[date.getHours()] += (next - cursor) / 60000;
      cursor = next;
    }
  }
  return hours;
}
export function duration(minutes: number) {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
