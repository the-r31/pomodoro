import { useEffect, useRef, useState } from "react";
import type { Task } from "./calendar-data";
import { validSchedule } from "./calendar-data";
import { reminderTarget } from "./planner-data";
import { readStored } from "./useTaskStore";
interface Delivery { last?: number; snooze?: number; dismissed?: boolean }
export function useReminders(tasks: Task[], notify: (title: string, body: string) => Promise<void>) {
  const ledger = useRef(readStored<Record<string, Delivery>>("pomo-reminder-delivery", {}));
  const [alerts, setAlerts] = useState<{ key: string; taskId: string; title: string }[]>([]);
  const persist = () => localStorage.setItem("pomo-reminder-delivery", JSON.stringify(ledger.current));
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const validKeys = new Set<string>();
      for (const task of tasks) {
        if (!validSchedule(task.schedule)) continue;
        const target = reminderTarget(task); if (!target) continue;
        validKeys.add(target.key);
        const delivery = ledger.current[target.key] || {};
        if (delivery.dismissed || now < (delivery.snooze || target.at)) continue;
        const repeat = task.reminder!.repeat * 60000;
        if (delivery.last && !delivery.snooze && (!repeat || now - delivery.last < repeat)) continue;
        // On reopen, surface recent missed reminders rather than replaying an old backlog.
        if (!delivery.last && now - target.at > 86400000) continue;
        ledger.current[target.key] = { last: now }; persist();
        setAlerts(old => [...old.filter(a => a.taskId !== task.id), { key: target.key, taskId: task.id, title: task.title }]);
        void notify("Task reminder", task.title);
      }
      setAlerts(old => old.filter(a => validKeys.has(a.key)));
    };
    check(); const timer = setInterval(check, 15000); return () => clearInterval(timer);
  }, [tasks, notify]);
  const dismiss = (key: string, snooze = false) => {
    ledger.current[key] = snooze ? { ...ledger.current[key], snooze: Date.now() + 300000 } : { dismissed: true };
    persist(); setAlerts(old => old.filter(a => a.key !== key));
  };
  return { alerts, dismiss };
}
