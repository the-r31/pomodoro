import { useEffect, useRef, useState } from "react";
import type { Task } from "./calendar-data";
import { colors, layoutEvents, timeMinutes, validSchedule, tasksOnDate, daySlice, scheduleLabel } from "./calendar-data";
import { dayKey, periodDays, shiftPeriod } from "./stats-data";
import "./Calendar.css";
import ScheduleFields from "./ScheduleFields";

interface Props { tasks: Task[]; onChange: (tasks: Task[]) => void; onClose: () => void; onFocus: (task: Task) => void; canFocus: boolean; focusMinutes: number }
export default function Calendar({ tasks, onChange, onClose, onFocus, canFocus, focusMinutes }: Props) {
  const [view, setView] = useState<"Day" | "Week" | "Month">("Month");
  const [selected, setSelected] = useState(dayKey(new Date()));
  const [anchor, setAnchor] = useState(new Date());
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const scheduled = tasks.filter(t => validSchedule(t.schedule));
  const daily = tasksOnDate(scheduled, selected).sort((a, b) => timeMinutes(a.schedule!.start) - timeMinutes(b.schedule!.start));
  const unscheduled = tasks.filter(t => !t.done && !validSchedule(t.schedule));
  const days = periodDays(anchor, view);
  const monthStart = periodDays(anchor, "Month")[0];
  const gridStart = new Date(monthStart); gridStart.setDate(1 - (monthStart.getDay() + 6) % 7);
  const monthDays = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * 52; }, [view, anchor]);
  useEffect(() => { if (editing) titleInput.current?.focus(); }, [editing?.id]);
  const edit = (task?: Task) => {
    const taskId = task?.id;
    task = taskId ? tasks.find(t => t.id === taskId) || task : undefined;
    setError(""); setEditing(task ? { ...task, schedule: validSchedule(task.schedule) ? { ...task.schedule! } : { date: selected, start: "09:00", end: "09:30", color: "blue" } } : { id: crypto.randomUUID(), title: "", done: false, schedule: { date: selected, start: "09:00", end: "09:30", color: "blue" } });
  };
  const selectDate = (d: Date) => { setSelected(dayKey(d)); setAnchor(d); };
  const move = (delta: number) => selectDate(shiftPeriod(anchor, view, delta));
  const save = () => {
    if (!editing) return;
    if (!editing.title.trim()) { setError("Enter a task title."); return; }
    if (!validSchedule(editing.schedule)) { setError("Choose valid dates and an end time later than the start time."); return; }
    const task = { ...editing, title: editing.title.trim() };
    onChange(tasks.some(t => t.id === task.id) ? tasks.map(t => t.id === task.id ? task : t) : [...tasks, task]);
    selectDate(new Date(`${task.schedule!.date}T12:00:00`)); setEditing(null);
  };
  const heading = view === "Day" ? anchor.toLocaleDateString("en", { month: "long", day: "numeric" }) : view === "Week" ? `${days[0].toLocaleDateString("en", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en", { month: "short", day: "numeric" })}` : anchor.toLocaleDateString("en", { month: "long", year: "numeric" });
  return <section className="calendar-page">
    <header className="analytics-header"><button className="round-button" aria-label="Close calendar" onClick={onClose}>×</button><h1>Calendar</h1><button className="round-button" aria-label="Schedule a task" onClick={() => edit()}>+</button></header>
    <div className="calendar-intro"><span>MAKE TIME FOR WHAT MATTERS</span><h2>Your focus, planned.</h2><p>A little structure. More room to do your best work.</p></div>
    <nav className="calendar-toolbar"><div className="period-tabs">{(["Day", "Week", "Month"] as const).map(v => <button key={v} aria-pressed={view === v} className={view === v ? "selected" : ""} onClick={() => { setView(v); setAnchor(new Date(`${selected}T12:00:00`)); }}>{v}</button>)}</div><button className="text-button" onClick={() => selectDate(new Date())}>Today</button></nav>
    <div className="calendar-board"><div className="calendar-heading"><h2>{heading}</h2><div><button aria-label="Previous calendar period" onClick={() => move(-1)}>‹</button><button aria-label="Next calendar period" onClick={() => move(1)}>›</button></div></div>
      {view === "Month" ? <><div className="weekday-row">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}</div><div className="month-grid">{monthDays.map(d => {
        const key = dayKey(d), events = tasksOnDate(scheduled, key);
        return <div key={key} className={`month-cell ${d.getMonth() !== anchor.getMonth() ? "outside" : ""} ${selected === key ? "selected-day" : ""}`}><button className={`day-number ${key === dayKey(new Date()) ? "is-today" : ""}`} aria-label={`Select ${key}`} aria-pressed={selected === key} onClick={() => selectDate(d)}>{d.getDate()}</button>{events.slice(0, 3).map(t => <button key={t.id} className={`calendar-chip color-${t.schedule!.color} ${t.done ? "event-done" : ""}`} title={`${t.title} · ${t.schedule!.start}–${t.schedule!.end}`} onClick={() => edit(t)}>{t.title}</button>)}{events.length > 3 && <button className="more-events" onClick={() => { selectDate(d); setView("Day"); }}>+{events.length - 3} more</button>}</div>;
      })}</div></> : <div className="time-scroll" ref={scroller}><div className={`time-board ${view === "Week" ? "week-board" : ""}`}><div className="time-header"><span/>{days.map(d => <button key={dayKey(d)} className={dayKey(d) === selected ? "selected" : ""} onClick={() => setSelected(dayKey(d))}>{d.toLocaleDateString("en", { weekday: "short" })}<b>{d.getDate()}</b></button>)}</div><div className="time-columns"><div className="time-labels">{Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>{days.map(d => <div className="time-day" key={dayKey(d)}>{layoutEvents(tasksOnDate(scheduled, dayKey(d)).map(t => daySlice(t, dayKey(d)))).map(({ task: t, column, columns }) => <button key={t.id} className={`time-event color-${t.schedule!.color} ${t.done ? "event-done" : ""}`} aria-label={`Edit ${t.title}`} title={`${t.title} · ${t.schedule!.start}–${t.schedule!.end}`} style={{ top: timeMinutes(t.schedule!.start) / 60 * 52, height: Math.max(14, (timeMinutes(t.schedule!.end) - timeMinutes(t.schedule!.start)) / 60 * 52), left: `${column / columns * 100}%`, width: `${100 / columns}%` }} onClick={() => edit(t)}><b>{t.title}</b><small>{t.schedule!.start} – {t.schedule!.end}</small></button>)}</div>)}</div></div></div>}
    </div>
    <section className="calendar-agenda"><div className="card-heading"><h2>{new Date(`${selected}T12:00:00`).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}</h2><span>{daily.length} planned</span></div>
      {!daily.length && <div className="calendar-empty"><b>A little breathing room.</b><p>No tasks scheduled for this day.</p><button onClick={() => edit()}>+ Schedule a task</button></div>}
      {daily.map(t => <article className="agenda-item" key={t.id}><div className={`agenda-stripe color-${t.schedule!.color}`}/><label><input type="checkbox" checked={t.done} aria-label={`Complete ${t.title}`} onChange={() => onChange(tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}/></label><button className={`agenda-title ${t.done ? "event-done" : ""}`} onClick={() => edit(t)}><b>{t.title}</b><small>{scheduleLabel(t)}</small></button><button className="focus-task" disabled={!canFocus || t.done} aria-label={`Start focus on ${t.title}`} title={`Start a ${focusMinutes}-minute focus session`} onClick={() => onFocus(t)}>▶</button></article>)}
      {!canFocus && <p className="chart-note">Finish or reset your current timer before starting a planned task.</p>}
    </section>
    {!!unscheduled.length && <section className="unscheduled"><div className="card-heading"><h2>Not scheduled</h2><span>{unscheduled.length}</span></div>{unscheduled.map(t => <button key={t.id} onClick={() => edit(t)}><span>{t.title}</span><small>Set time +</small></button>)}</section>}
    <p className="calendar-footer">Your schedule stays on this device. Times use your local time zone.</p>
    {editing && <div className="calendar-modal" role="dialog" aria-modal="true" aria-label="Schedule task" onKeyDown={e => {
      if (e.key === "Escape") setEditing(null);
      if (e.key === "Tab") { const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input, select')).filter(el => !el.hasAttribute('disabled')); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }}><form onSubmit={e => { e.preventDefault(); save(); }}><div className="card-heading"><h2>{tasks.some(t => t.id === editing.id) ? "Edit task" : "Schedule a task"}</h2><button type="button" aria-label="Close task editor" onClick={() => setEditing(null)}>×</button></div><label>Task<input ref={titleInput} required maxLength={160} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="What would you like to work on?"/></label><ScheduleFields task={editing} onChange={setEditing}/><fieldset><legend>Color</legend>{colors.map(c => <button key={c} type="button" className={`color-choice color-${c}`} aria-label={`${c} color`} aria-pressed={editing.schedule!.color === c} onClick={() => setEditing({ ...editing, schedule: { ...editing.schedule!, color: c } })}>{editing.schedule!.color === c ? "✓" : ""}</button>)}</fieldset>{error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit">Save task</button>{tasks.some(t => t.id === editing.id && validSchedule(t.schedule)) && <button className="unschedule-button" type="button" onClick={() => { onChange(tasks.map(t => t.id === editing.id ? { ...t, schedule: undefined } : t)); setEditing(null); }}>Remove from calendar</button>}</form></div>}
  </section>;
}
