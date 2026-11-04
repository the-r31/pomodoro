import type { ReactNode } from "react";
import Planner from "./Planner";
import type { PlannerView } from "./Planner";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { localDay as today, remainingSeconds, nextBreak } from "./timer";
import Statistics from "./Statistics";
import Calendar from "./Calendar";
import type { Task } from "./calendar-data";
import { useTaskStore } from "./useTaskStore";
import { useReminders } from "./useReminders";
import type { FocusRecord } from "./stats-data";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

type Mode = "focus" | "short" | "long";

interface Settings {
  focus: number; // minutes
  short: number;
  long: number;
  every: number; // long break after N focus sessions
  autoStart: boolean;
  goal: number;
  sound: boolean;
}

const DEFAULTS: Settings = { focus: 25, short: 5, long: 15, every: 4, autoStart: false, goal: 8, sound: true };
const LABELS: Record<Mode, string> = { focus: "Focus", short: "Short break", long: "Long break" };

const load = <T extends object>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio not available */
  }
}

async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
    /* running in plain browser */
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = load("pomo-settings", DEFAULTS);
    for (const k of ["focus", "short", "long", "every", "goal"] as const) s[k] = Math.min(k === "every" ? 12 : 120, Math.max(1, Math.round(Number(s[k]) || DEFAULTS[k])));
    return s;
  });
  const [history, setHistory] = useState<Record<string, number>>(() => load("pomo-history", {}));
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem("pomo-dark") !== "0");
  const [saved] = useState(() => load(localStorage.getItem("pomo-timer") ? "pomo-timer" : "pomo-timer-checkpoint", { mode: "focus" as Mode, left: settings.focus * 60, running: false, cycle: 0, endAt: 0, total: settings.focus * 60, segments: [] as FocusRecord["segments"], segmentStart: 0, task: "", sessionId: "" }));
  const sessionId = useRef(saved.sessionId || crypto.randomUUID());
  const [timerVersion, setTimerVersion] = useState(0);
  const segments = useRef<FocusRecord["segments"]>(Array.isArray(saved.segments) ? saved.segments : []);
  const segmentStart = useRef(saved.segmentStart || 0);
  const sessionTask = useRef(saved.task || "");
  const [showStats, setShowStats] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [records, setRecords] = useState<FocusRecord[]>(() => {
    try { const data = JSON.parse(localStorage.getItem("pomo-records") || "[]"); return Array.isArray(data) ? data.filter(r => r && typeof r.id === "string" && Number.isFinite(r.endedAt) && Number.isFinite(r.minutes) && Array.isArray(r.segments)) : []; } catch { return []; }
  });
  const [mode, setMode] = useState<Mode>(() => ["focus", "short", "long"].includes(saved.mode) ? saved.mode : "focus");
  const [left, setLeft] = useState(Math.max(0, Number(saved.left) || 0));
  const [running, setRunning] = useState(saved.running === true && saved.endAt > 0);
  const [cycle, setCycle] = useState(Math.max(0, Math.min(12, Number(saved.cycle) || 0)));
  const [showSettings, setShowSettings] = useState(false);
  const endAt = useRef(saved.endAt);
  const [total, setTotal] = useState(Math.max(60, Number(saved.total) || settings.focus * 60));
  const [view, setView] = useState<"full" | "mini" | "wide" | "tasks" | "calendar" | "matrix" | "habits">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinned, setPinned] = useState(true);
  const { tasks, setTasks, activities, logActivity } = useTaskStore();
  const { alerts, dismiss } = useReminders(tasks, notify);
  const [draft, setDraft] = useState("");
  const [minutes, setMinutes] = useState<Record<string, number>>(() => load("pomo-minutes", {}));
  const activeTask = tasks.find(t => !t.done);

  useEffect(() => localStorage.setItem("pomo-timer", JSON.stringify({ mode, left, running, cycle, endAt: endAt.current, total, segments: segments.current, segmentStart: segmentStart.current, task: sessionTask.current, sessionId: sessionId.current })), [mode, left, running, cycle, total, timerVersion]);

  const saveFocus = useCallback((until = Date.now(), completed = false) => {
    if (mode !== "focus") return;
    const end = Math.min(until, endAt.current || until);
    if (segmentStart.current && end > segmentStart.current) {
      segments.current.push({ start: segmentStart.current, end });
      segmentStart.current = running ? end : 0;
    }
    let previous: FocusRecord[] = [];
    try { const data = JSON.parse(localStorage.getItem("pomo-records") || "[]"); if (Array.isArray(data)) previous = data; } catch { /* Keep the timer usable offline. */ }
    const old = previous.find(r => r.id === sessionId.current);
    const elapsed = segments.current.reduce((sum, s) => sum + (s.end - s.start) / 60000, 0);
    if (!elapsed) return;
    const nextMinutes = load<Record<string, number>>("pomo-minutes", {});
    const byDay = (items: FocusRecord["segments"], direction: number) => {
      for (const s of items) {
        let cursor = s.start;
        while (cursor < s.end) {
          const d = new Date(cursor), boundary = new Date(cursor); boundary.setHours(24, 0, 0, 0);
          const next = Math.min(s.end, +boundary), key = today(d);
          nextMinutes[key] = Math.max(0, (nextMinutes[key] || 0) + direction * (next - cursor) / 60000);
          cursor = next;
        }
      }
    };
    byDay(old?.segments || [], -1); byDay(segments.current, 1);
    const record: FocusRecord = { id: sessionId.current, endedAt: end, minutes: elapsed, task: sessionTask.current, segments: [...segments.current], completed: completed || old?.completed === true };
    const nextRecords = [...previous.filter(r => r.id !== record.id), record];
    localStorage.setItem("pomo-minutes", JSON.stringify(nextMinutes));
    localStorage.setItem("pomo-records", JSON.stringify(nextRecords));
    setMinutes(nextMinutes); setRecords(nextRecords);
    if (completed && !old?.completed) {
      const h = load<Record<string, number>>("pomo-history", {}), key = today(new Date(end));
      h[key] = (h[key] || 0) + 1; localStorage.setItem("pomo-history", JSON.stringify(h)); setHistory(h);
    }
  }, [mode, running]);

  const checkpoint = useCallback(() => {
    saveFocus();
    const value = { mode, left: running ? remainingSeconds(endAt.current) : left, running: false, cycle, endAt: 0, total, segments: [...segments.current], segmentStart: 0, task: sessionTask.current, sessionId: sessionId.current };
    localStorage.setItem("pomo-timer-checkpoint", JSON.stringify(value));
  }, [saveFocus, mode, left, running, cycle, total]);
  const checkpointRef = useRef(checkpoint); checkpointRef.current = checkpoint;
  useEffect(() => {
    const save = () => { if (JSON.parse(localStorage.getItem("pomo-timer") || "{}").running) checkpointRef.current(); };
    window.addEventListener("pomo-before-sync", save);
    window.addEventListener("pagehide", save);
    const interval = setInterval(save, 15000);
    return () => { clearInterval(interval); window.removeEventListener("pomo-before-sync", save); window.removeEventListener("pagehide", save); };
  }, []);
  const lastTimerState = useRef(`${mode}:${running}:${cycle}:${total}:${timerVersion}`);
  useEffect(() => {
    const state = `${mode}:${running}:${cycle}:${total}:${timerVersion}`;
    if (lastTimerState.current === state) return;
    lastTimerState.current = state;
    checkpoint(); window.dispatchEvent(new Event("pomo-sync-request"));
  }, [mode, running, cycle, total, checkpoint, timerVersion]);

  const changeView = async (next: typeof view) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (isTauri()) {
        const win = getCurrentWindow();
        await win.setDecorations(next === "full");
        await win.setAlwaysOnTop(next !== "full" && pinned);
        await win.setSize(new LogicalSize(next === "mini" ? 300 : next === "wide" ? 440 : next === "full" ? 420 : 380, next === "mini" ? 250 : next === "wide" ? 200 : next === "full" ? 780 : 500));
      }
      setView(next); setShowSettings(false);
    } catch {
      setError("Could not open the widget. Please try again.");
      if (isTauri()) { const win = getCurrentWindow(); await win.setDecorations(true).catch(() => {}); await win.setAlwaysOnTop(false).catch(() => {}); await win.setSize(new LogicalSize(420, 780)).catch(() => {}); }
      setView("full");
    } finally { setBusy(false); }
  };
  const togglePin = async () => {
    try { if (isTauri()) await getCurrentWindow().setAlwaysOnTop(!pinned); setPinned(!pinned); }
    catch { setError("Could not keep the window on top."); }
  };

  useEffect(() => localStorage.setItem("pomo-settings", JSON.stringify(settings)), [settings]);
  useEffect(() => {
    localStorage.setItem("pomo-dark", dark ? "1" : "0");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    document.title = running ? `${fmt(left)} · ${LABELS[mode]}` : "Pomodoro";
  }, [left, mode, running]);

  const switchMode = useCallback(
    (next: Mode, autoRun = false) => {
      saveFocus();
      sessionId.current = crypto.randomUUID();
      setTimerVersion(v => v + 1);
      setMode(next);
      setLeft(settings[next] * 60);
      setTotal(settings[next] * 60);
      segments.current = [];
      segmentStart.current = autoRun ? Date.now() : 0;
      sessionTask.current = activeTask?.title || "";
      endAt.current = Date.now() + settings[next] * 60 * 1000;
      setRunning(autoRun);
    },
    [settings, activeTask?.title, saveFocus]
  );

  const complete = useCallback(() => {
    if (settings.sound) beep();
    if (mode === "focus") {
      saveFocus(endAt.current, true);
      const next = nextBreak(cycle, settings.every);
      const isLong = next.mode === "long";
      setCycle(next.cycle);
      notify("Focus complete", isLong ? "Time for a long break!" : "Time for a short break.");
      switchMode(isLong ? "long" : "short", settings.autoStart);
    } else {
      notify("Break complete", "Time to get back to work.");
      switchMode("focus", settings.autoStart);
    }
  }, [mode, cycle, settings, switchMode, total, saveFocus]);

  // Timestamp-based tick so the timer stays accurate even if the window is throttled.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const remaining = remainingSeconds(endAt.current);
      setLeft(remaining);
      if (remaining <= 0) { clearInterval(id); complete(); }
    }, 250);
    return () => clearInterval(id);
  }, [running, complete]);

  const toggle = () => {
    if (!running) {
      endAt.current = Date.now() + left * 1000;
      segmentStart.current = Date.now();
      if (left === total) sessionTask.current = activeTask?.title || "";
    } else {
      if (Date.now() >= endAt.current) { complete(); return; }
      if (segmentStart.current) segments.current.push({ start: segmentStart.current, end: Date.now() });
      segmentStart.current = 0;
      setLeft(remainingSeconds(endAt.current));
    }
    setRunning(!running);
  };
  const reset = () => {
    saveFocus(); sessionId.current = crypto.randomUUID();
    setTimerVersion(v => v + 1);
    setRunning(false);
    setLeft(settings[mode] * 60);
    setTotal(settings[mode] * 60);
    segments.current = []; segmentStart.current = 0; sessionTask.current = "";
  };
  const skip = () => (mode === "focus" ? switchMode("short") : switchMode("focus"));

  const updateSetting = (key: keyof Settings, value: number | boolean) => {
    setSettings({ ...settings, [key]: value });
    if (!running && typeof value === "number" && key === mode) {
      saveFocus(); sessionId.current = crypto.randomUUID(); setTimerVersion(v => v + 1);
      setLeft(value * 60); setTotal(value * 60); segments.current = []; segmentStart.current = 0;
    }
  };

  const progress = total ? 1 - left / total : 0;
  const R = 110;
  const C = 2 * Math.PI * R;
  const todayCount = history[today()] ?? 0;
  const allTime = Object.values(history).reduce((a, b) => a + b, 0);

  const focusTask = (task: Task) => {
    if (running || left !== total) return;
    setTasks(current => [task, ...current.filter(t => t.id !== task.id)]);
    switchMode("focus", true); sessionTask.current = task.title;
    setShowCalendar(false); setShowPlanner(false); window.scrollTo(0, 0);
  };
  const wrap = (content: ReactNode) => <>{content}<div className="reminder-stack" aria-live="polite">{alerts.map(a => <article key={a.key} className="reminder-alert"><small>TASK REMINDER</small><p>{a.title}</p><div><button onClick={() => dismiss(a.key)}>Dismiss</button><button onClick={() => dismiss(a.key, true)}>Snooze 5m</button><button onClick={() => { setTasks(current => current.map(t => t.id === a.taskId ? { ...t, done: true } : t)); dismiss(a.key); }}>Complete</button></div></article>)}</div></>;
  const plannerProps = { tasks, onChange: setTasks, activities, log: logActivity, canFocus: !running && left === total, onFocus: focusTask };
  const calendarProps = { tasks, onChange: setTasks, canFocus: !running && left === total, focusMinutes: settings.focus, onFocus: focusTask };
  if (["tasks", "calendar", "matrix", "habits"].includes(view)) {
    const tabs: Record<string, PlannerView> = { tasks: "Lists", matrix: "Matrix", habits: "Habits" };
    return wrap(<div className="planner-widget"><header className="widget-titlebar"><h1 onMouseDown={e => { if (isTauri() && e.button === 0) void getCurrentWindow().startDragging().catch(() => setError("Could not move the window.")); }}>{view}</h1><button onClick={togglePin}>{pinned ? "Unpin" : "Pin"}</button><button disabled={busy} onClick={() => void changeView("full")}>Open ↗</button></header>{error && <p role="alert" className="error">{error}</p>}{view === "calendar" ? <Calendar {...calendarProps} onClose={() => void changeView("full")}/> : <Planner {...plannerProps} compact initialView={tabs[view]} onClose={() => void changeView("full")}/>}</div>);
  }
  if (showStats) return wrap(<Statistics history={history} minutes={minutes} records={records} onClose={() => setShowStats(false)} />);
  if (showPlanner) return wrap(<Planner {...plannerProps} onClose={() => setShowPlanner(false)}/>);
  if (showCalendar) return wrap(<Calendar {...calendarProps} onClose={() => setShowCalendar(false)} />);

  return wrap(
    <main className={`app mode-${mode} view-${view}`}>
      <header>
        <h1 onMouseDown={e => { if (view !== "full" && isTauri() && e.button === 0) void getCurrentWindow().startDragging().catch(() => setError("Could not move the window.")); }}>Pomodoro <span className="live-dot" /></h1>
        <div className="header-actions">
          {view !== "full" ? <><button className="icon" onClick={togglePin} aria-pressed={pinned}>{pinned ? "Unpin" : "Pin"}</button><button className="icon" disabled={busy} onClick={() => void changeView("full")}>Open ↗</button></> : <>
          <button className="icon" onClick={() => setDark(!dark)} title="Theme">
            {dark ? "Light" : "Dark"}
          </button>
          <button className="icon" onClick={() => window.dispatchEvent(new Event("pomo-open-account"))}>Account</button>
          <button className="icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            Settings
          </button>
          </>}
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {view === "full" && <div className="widget-picker"><span>DESKTOP WIDGET</span><button disabled={busy} onClick={() => void changeView("mini")}>▣ Mini</button><button disabled={busy} onClick={() => void changeView("wide")}>▤ Wide</button></div>}
      {view === "full" && <div className="widget-extras">{(["tasks", "calendar", "matrix", "habits"] as const).map(v => <button key={v} disabled={busy} onClick={() => void changeView(v)}>{v[0].toUpperCase() + v.slice(1)} widget</button>)}</div>}
      {view !== "full" && <p className="widget-task">{activeTask?.title || "One task at a time."}</p>}

      <nav className="tabs">
        {(Object.keys(LABELS) as Mode[]).map((m) => (
          <button key={m} className={m === mode ? "active" : ""} onClick={() => switchMode(m)}>
            {LABELS[m]}
          </button>
        ))}
      </nav>

      <section className="timer">
        <svg viewBox="0 0 260 260" width="260" height="260">
          <circle className="track" cx="130" cy="130" r={R} />
          <circle
            className="bar"
            cx="130"
            cy="130"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 130 130)"
          />
        </svg>
        <div className="time">
          <span>{fmt(left)}</span>
          <small>{LABELS[mode]}</small>
        </div>
      </section>

      <section className="controls">
        <button className="secondary" onClick={reset}>Reset</button>
        <button className="primary" onClick={toggle}>{running ? "Pause" : "Start"}</button>
        <button className="secondary" onClick={skip}>Skip</button>
      </section>

      <section className="dots" aria-label={`${cycle} / ${settings.every} sessions`}>
        {Array.from({ length: settings.every }).map((_, i) => (
          <span key={i} className={i < cycle ? "dot on" : "dot"} />
        ))}
      </section>

      <footer className="stats">
        <div><b>{todayCount}</b><span>Today</span></div>
        <div><b>{Math.round(minutes[today()] ?? 0)}m</b><span>Focus</span></div>
        <div><b>{allTime}</b><span>Total</span></div>
      </footer>
      {view === "full" && <>
        <button className="statistics-link planner-link" onClick={() => { setShowPlanner(true); window.scrollTo(0, 0); }}><span><b>▤ Planner</b><small>Lists, matrix, timeline & habits</small></span><span>↗</span></button>
        <button className="statistics-link calendar-link" onClick={() => { setShowCalendar(true); window.scrollTo(0, 0); }}><span><b>▦ Calendar</b><small>Plan your day, week & month</small></span><span>↗</span></button>
        <button className="statistics-link focus-statistics-link" onClick={() => { setShowStats(true); window.scrollTo(0, 0); }}><span><b>◴ Focus Statistics</b><small>Trends, records & activity</small></span><span>↗</span></button>
        <section className="goal"><div><span>Daily goal</span><b>{todayCount} / {settings.goal}</b></div><progress value={todayCount} max={settings.goal} /><small>{todayCount >= settings.goal ? "Goal reached. Great work!" : "Small steps, big results."}</small></section>
        <section className="tasks"><div className="section-heading"><h2>Tasks</h2><span>{tasks.filter(t => t.done).length}/{tasks.length}</span></div>
          <form onSubmit={e => { e.preventDefault(); if (!draft.trim()) return; setTasks([...tasks, { id: crypto.randomUUID(), title: draft.trim(), done: false }]); setDraft(""); }}><input aria-label="New task" placeholder="What will you focus on?" maxLength={160} value={draft} onChange={e => setDraft(e.target.value)} /><button type="submit" aria-label="Add task">+</button></form>
          <ul>{tasks.map(t => <li key={t.id} className={t.done ? "done" : ""}><label><input type="checkbox" checked={t.done} onChange={() => setTasks(tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x))} /><span>{t.title}</span></label><button aria-label={`Delete ${t.title}`} onClick={() => setTasks(tasks.filter(x => x.id !== t.id))}>×</button></li>)}</ul>
          {!tasks.length && <p className="empty">Add your first task to get started.</p>}
        </section>
      </>}

      {showSettings && (
        <div className="settings">
          <h2>Settings</h2>
          {(["focus", "short", "long", "every", "goal"] as const).map((k) => (
            <label key={k}>
              <span>{k === "goal" ? "Daily goal (sessions)" : k === "every" ? "Sessions before a long break" : `${LABELS[k]} (min)`}</span>
              <input
                type="number"
                min={1}
                max={k === "every" ? 12 : 120}
                value={settings[k]}
                onChange={(e) => updateSetting(k, Math.min(k === "every" ? 12 : 120, Math.max(1, Math.round(Number(e.target.value) || 1))))}
              />
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(e) => updateSetting("autoStart", e.target.checked)}
            />
            <span>Start the next session automatically</span>
          </label>
          <label className="check"><input type="checkbox" checked={settings.sound} onChange={e => updateSetting("sound", e.target.checked)} /><span>Play a sound when a session ends</span></label>
          <button className="primary" onClick={() => setShowSettings(false)}>Close</button>
        </div>
      )}
    </main>
  );
}


