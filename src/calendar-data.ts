export interface Task {
  id: string;
  title: string;
  done: boolean;
  listId?: string;
  priority?: "none" | "low" | "medium" | "high";
  important?: boolean;
  urgent?: boolean;
  notes?: string;
  reminder?: { before: number; atEnd?: boolean; repeat: number };
  schedule?: { date: string; endDate?: string; allDay?: boolean; start: string; end: string; color: string };
}
export const colors = ["blue", "pink", "mint", "purple", "amber"] as const;
export function timeMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(key: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(new Date(`${key}T12:00:00`)) === key;
}
export function scheduleBounds(s: NonNullable<Task["schedule"]>) {
  const start = +new Date(`${s.date}T${s.allDay ? "00:00" : s.start}:00`);
  const endDate = s.endDate || s.date;
  const end = new Date(`${endDate}T${s.allDay ? "00:00" : s.end}:00`);
  if (s.allDay) end.setDate(end.getDate() + 1);
  return { start, end: +end };
}
export function validSchedule(schedule: Task["schedule"]): boolean {
  if (!schedule || !validDate(schedule.date) || !validDate(schedule.endDate || schedule.date)) return false;
  if (!schedule.allDay && ![schedule.start, schedule.end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return false;
  const { start, end } = scheduleBounds(schedule);
  return end > start;
}
export function tasksOnDate(tasks: Task[], day: string): Task[] {
  const start = new Date(`${day}T00:00:00`), end = new Date(start); end.setDate(end.getDate() + 1);
  return tasks.filter(t => validSchedule(t.schedule) && scheduleBounds(t.schedule!).start < +end && scheduleBounds(t.schedule!).end > +start);
}
export function daySlice(task: Task, date: string): Task {
  const s = task.schedule!;
  return { ...task, schedule: { ...s, date, endDate: date, allDay: false, start: s.allDay || s.date < date ? "00:00" : s.start, end: s.allDay || (s.endDate || s.date) > date ? "23:59" : s.end } };
}
export function scheduleLabel(task: Task) {
  if (!validSchedule(task.schedule)) return "Not scheduled";
  const s = task.schedule!;
  return `${s.date}${s.endDate && s.endDate !== s.date ? ` – ${s.endDate}` : ""} · ${s.allDay ? "All day" : `${s.start} – ${s.end}`}`;
}
export function shiftTask(task: Task, days: number): Task {
  if (!validSchedule(task.schedule)) return task;
  const shift = (key: string) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); };
  return { ...task, schedule: { ...task.schedule!, date: shift(task.schedule!.date), endDate: task.schedule!.endDate ? shift(task.schedule!.endDate) : undefined } };
}
// Assign overlapping events separate columns so each remains selectable.
export function layoutEvents(tasks: Task[]) {
  const sorted = tasks.filter(t => validSchedule(t.schedule)).sort((a, b) => timeMinutes(a.schedule!.start) - timeMinutes(b.schedule!.start));
  const result: { task: Task; column: number; columns: number }[] = [];
  let group: typeof result = []; let ends: number[] = []; let groupEnd = -1;
  const flush = () => { group.forEach(item => { item.columns = ends.length; result.push(item); }); group = []; ends = []; };
  sorted.forEach(task => {
    const start = timeMinutes(task.schedule!.start), end = timeMinutes(task.schedule!.end);
    if (start >= groupEnd) flush();
    let column = ends.findIndex(e => e <= start);
    if (column < 0) column = ends.length;
    ends[column] = end; groupEnd = Math.max(groupEnd, end);
    group.push({ task, column, columns: 1 });
  });
  flush(); return result;
}
