import type { Task } from "./calendar-data";
export interface Activity { id: string; at: number; taskId?: string; listId?: string; title: string; action: string; detail?: string }
export interface TaskList { id: string; name: string; background: string; image?: string }
export interface Habit { id: string; name: string; color: string; days: string[] }
export interface Filter { name: string; query: string; list: string; status: string; priority: string; date: string; logic: "AND" | "OR" }
export const defaultFilter: Filter = { name: "", query: "", list: "all", status: "open", priority: "all", date: "all", logic: "AND" };
export const backgrounds = ["plain", "ocean", "forest", "sunset", "lavender"];
export function taskChanges(before: Task[], after: Task[], now: number): Omit<Activity, "id">[] {
  const changes: Omit<Activity, "id">[] = [];
  const previous = new Map(before.map(t => [t.id, t]));
  for (const t of after) {
    const old = previous.get(t.id);
    const add = (action: string, detail?: string) => changes.push({ at: now, taskId: t.id, listId: t.listId || "inbox", title: t.title, action, detail });
    if (!old) { add("Created task"); continue; }
    if (old.title !== t.title) add("Renamed task", `${old.title} → ${t.title}`);
    if (old.done !== t.done) add(t.done ? "Completed task" : "Reopened task");
    if (JSON.stringify(old.schedule) !== JSON.stringify(t.schedule)) add(t.schedule ? "Changed schedule" : "Removed schedule", `${old.schedule ? `${old.schedule.date} ${old.schedule.start}` : "Unscheduled"} → ${t.schedule ? `${t.schedule.date} ${t.schedule.allDay ? "All day" : t.schedule.start}` : "Unscheduled"}`);
    if ((old.listId || "inbox") !== (t.listId || "inbox")) add("Moved to another list");
    if (old.priority !== t.priority || old.urgent !== t.urgent || old.important !== t.important) add("Updated priority");
    if (old.notes !== t.notes) add("Updated notes");
    if (JSON.stringify(old.reminder) !== JSON.stringify(t.reminder)) add("Updated reminder");
  }
  const ids = new Set(after.map(t => t.id));
  before.filter(t => !ids.has(t.id)).forEach(t => changes.push({ at: now, taskId: t.id, listId: t.listId || "inbox", title: t.title, action: "Deleted task" }));
  return changes;
}
export function matchesFilter(task: Task, filter: Filter, today: string, weekEnd: string) {
  if (filter.query && !`${task.title} ${task.notes || ""}`.toLowerCase().includes(filter.query.toLowerCase())) return false;
  if (filter.list !== "all" && (task.listId || "inbox") !== filter.list) return false;
  if (filter.status !== "all" && task.done !== (filter.status === "done")) return false;
  const checks: boolean[] = [];
  if (filter.priority !== "all") checks.push((task.priority || "none") === filter.priority);
  const date = task.schedule?.date, end = task.schedule?.endDate || date;
  if (filter.date !== "all") checks.push(filter.date === "unscheduled" ? !date : filter.date === "overdue" ? !!end && end < today : filter.date === "today" ? !!date && date <= today && !!end && end >= today : !!date && date <= weekEnd && !!end && end >= today);
  return checks.length === 0 || (filter.logic === "AND" ? checks.every(Boolean) : checks.some(Boolean));
}
export function quadrant(task: Task, today: string) {
  const important = task.important ?? (task.priority === "high" || task.priority === "medium");
  const urgent = task.urgent ?? (!!task.schedule?.date && task.schedule.date <= today);
  return important ? urgent ? 0 : 1 : urgent ? 2 : 3;
}
export function reminderTarget(task: Task) {
  const s = task.schedule, r = task.reminder;
  if (!s || !r || task.done) return null;
  const date = r.atEnd ? s.endDate || s.date : s.date;
  const time = s.allDay ? "09:00" : r.atEnd ? s.end : s.start;
  const at = +new Date(`${date}T${time}:00`) - (r.atEnd ? 0 : r.before * 60000);
  return Number.isFinite(at) ? { at, key: `${task.id}:${JSON.stringify(s)}:${JSON.stringify(r)}` } : null;
}
