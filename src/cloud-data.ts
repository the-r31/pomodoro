export const cloudKeys = ["pomo-workspace", "pomo-lists", "pomo-habits", "pomo-filters", "pomo-history", "pomo-minutes", "pomo-records", "pomo-settings", "pomo-dark", "pomo-timer-checkpoint"] as const;
export interface Snapshot { format: 1; values: Record<string, string | null> }
export interface CloudRow { user_id: string; revision: number; data: Snapshot }
export interface Binding { userId: string; revision: number; base: Snapshot }
export interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function capture(store: Store): Snapshot {
  const values: Snapshot["values"] = {};
  for (const key of cloudKeys) values[key] = store.getItem(key);
  if (!values["pomo-workspace"]) values["pomo-workspace"] = JSON.stringify({ tasks: JSON.parse(store.getItem("pomo-tasks") || "[]"), activities: [] });
  return { format: 1, values };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function fingerprint(data: Snapshot): string {
  return canonical(Object.fromEntries(cloudKeys.map(k => [k, data.values[k] == null ? null : JSON.parse(data.values[k])])));
}
export function validateSnapshot(input: unknown): asserts input is Snapshot {
  const data = input as Snapshot;
  if (!data || data.format !== 1 || !data.values || typeof data.values !== "object") throw new Error("Unsupported cloud data format.");
  for (const key of cloudKeys) {
    const raw = data.values[key];
    if (key === "pomo-timer-checkpoint" && raw === undefined) continue; // Older cloud workspaces.
    if (raw === null) continue;
    if (typeof raw !== "string") throw new Error("Incomplete cloud data. Nothing was replaced.");
    let value; try { value = JSON.parse(raw); } catch { throw new Error("Invalid cloud data. Nothing was replaced."); }
    if (key === "pomo-dark") { if (raw !== "0" && raw !== "1") throw new Error("Invalid theme setting."); }
    else if (key === "pomo-timer-checkpoint") {
      if (!value || !["focus", "short", "long"].includes(value.mode) || value.running !== false ||
        !Number.isFinite(value.left) || value.left < 0 || !Number.isFinite(value.total) || value.total < 60 || value.left > value.total ||
        !Number.isFinite(value.cycle) || value.cycle < 0 || value.cycle > 12 || value.endAt !== 0 || value.segmentStart !== 0 ||
        typeof value.sessionId !== "string" || typeof value.task !== "string" || !Array.isArray(value.segments) ||
        value.segments.some((s: any) => !s || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end < s.start)) throw new Error("Invalid timer checkpoint.");
    } else if (key === "pomo-workspace") {
      if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.activities) || value.tasks.some((t: any) => !t || typeof t.id !== "string" || typeof t.title !== "string" || typeof t.done !== "boolean")) throw new Error("Invalid task data.");
    } else if (["pomo-lists", "pomo-habits", "pomo-filters", "pomo-records"].includes(key)) {
      if (!Array.isArray(value)) throw new Error("Invalid collection data.");
    } else if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid settings or history data.");
  }
}
export function applySnapshot(store: Store, data: Snapshot) {
  validateSnapshot(data);
  const before = capture(store);
  try {
    for (const key of cloudKeys) { const value = data.values[key]; if (value == null) store.removeItem(key); else store.setItem(key, value); }
    store.setItem("pomo-tasks", JSON.stringify(JSON.parse(data.values["pomo-workspace"] || '{"tasks":[]}').tasks));
  } catch (error) {
    for (const key of cloudKeys) { const value = before.values[key]; if (value === null) store.removeItem(key); else store.setItem(key, value); }
    throw error;
  }
}
export type SyncAction = "same" | "push" | "pull" | "conflict";
export function decideSync(base: Snapshot, local: Snapshot, remote: Snapshot): SyncAction {
  const b = fingerprint(base), l = fingerprint(local), r = fingerprint(remote);
  if (l === r) return "same";
  if (r === b) return "push";
  if (l === b) return "pull";
  return "conflict";
}
