import { useCallback, useRef, useState } from "react";
import type { Task } from "./calendar-data";
import type { Activity } from "./planner-data";
import { taskChanges } from "./planner-data";
export function readStored<T>(key: string, fallback: T): T {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; }
}
export function useTaskStore() {
  const [state, update] = useState<{ tasks: Task[]; activities: Activity[] }>(() => {
    const saved = readStored<{ tasks: Task[]; activities: Activity[] } | null>("pomo-workspace", null);
    const raw = saved?.tasks || readStored<Task[]>("pomo-tasks", []);
    return { tasks: Array.isArray(raw) ? raw.filter(t => t && typeof t.id === "string" && typeof t.title === "string" && typeof t.done === "boolean") : [], activities: Array.isArray(saved?.activities) ? saved.activities : [] };
  });
  const current = useRef(state);
  const commit = useCallback((next: typeof state) => {
    localStorage.setItem("pomo-workspace", JSON.stringify(next));
    localStorage.setItem("pomo-tasks", JSON.stringify(next.tasks));
    current.current = next; update(next);
  }, []);
  const setTasks = useCallback((action: Task[] | ((tasks: Task[]) => Task[])) => {
    const old = current.current;
    const tasks = typeof action === "function" ? action(old.tasks) : action;
    const changes = taskChanges(old.tasks, tasks, Date.now()).map(c => ({ ...c, id: crypto.randomUUID() }));
    commit({ tasks, activities: [...old.activities, ...changes].slice(-1000) });
  }, [commit]);
  const logActivity = useCallback((entry: Omit<Activity, "id" | "at">) => {
    commit({ ...current.current, activities: [...current.current.activities, { ...entry, id: crypto.randomUUID(), at: Date.now() }].slice(-1000) });
  }, [commit]);
  return { ...state, setTasks, logActivity };
}
