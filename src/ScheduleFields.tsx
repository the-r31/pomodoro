import type { Task } from "./calendar-data";
import { scheduleBounds, validSchedule } from "./calendar-data";
export default function ScheduleFields({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const s = task.schedule!;
  const change = (value: Partial<typeof s>) => onChange({ ...task, schedule: { ...s, ...value } });
  const bounds = validSchedule(s) ? scheduleBounds(s) : null;
  return <>
    <div className="time-inputs"><label>Date<input type="date" required value={s.date} onChange={e => change({ date: e.target.value })}/></label><label>End date<input type="date" value={s.endDate || s.date} min={s.date} onChange={e => change({ endDate: e.target.value })}/></label></div>
    <label className="inline-check"><input type="checkbox" checked={!!s.allDay} onChange={e => change({ allDay: e.target.checked })}/>All day</label>
    {!s.allDay && <div className="time-inputs"><label>Start<input type="time" required value={s.start} onChange={e => change({ start: e.target.value })}/></label><label>End<input type="time" required value={s.end} onChange={e => change({ end: e.target.value })}/></label></div>}
    {bounds && <p className="chart-note">Duration: {Math.round((bounds.end - bounds.start) / 60000)} minutes</p>}
    <label>Reminder<select aria-label="Reminder" value={!task.reminder ? "none" : task.reminder.atEnd ? "end" : "before"} onChange={e => onChange({ ...task, reminder: e.target.value === "none" ? undefined : { before: task.reminder?.before || 0, atEnd: e.target.value === "end", repeat: task.reminder?.repeat || 0 } })}><option value="none">None</option><option value="before">At start / before start</option><option value="end">At the end</option></select></label>
    {task.reminder && <><div className="time-inputs">{!task.reminder.atEnd && <label>Minutes early<input type="number" min="0" max="10080" value={task.reminder.before} onChange={e => onChange({ ...task, reminder: { ...task.reminder!, before: Math.min(10080, Math.max(0, Number(e.target.value) || 0)) } })}/></label>}<label>Repeat until dismissed<select aria-label="Repeat until dismissed" value={task.reminder.repeat} onChange={e => onChange({ ...task, reminder: { ...task.reminder!, repeat: Number(e.target.value) } })}><option value="0">Once</option><option value="1">Every minute</option><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option></select></label></div><p className="chart-note">Works while the app is open. All-day reminders use 9:00 AM. Dismiss, snooze, or complete the task to stop alerts.</p></>}
  </>;
}
