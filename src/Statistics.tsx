import { useState } from "react";
import { dayKey, duration, hourlyMinutes, periodDays, shiftPeriod } from "./stats-data";
import type { FocusRecord, Period } from "./stats-data";
import "./Statistics.css";

interface Props { history: Record<string, number>; minutes: Record<string, number>; records: FocusRecord[]; onClose: () => void }
export default function Statistics({ history, minutes, records, onClose }: Props) {
  const [period, setPeriod] = useState<Period>("Week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [year, setYear] = useState(new Date().getFullYear());
  const days = periodDays(anchor, period);
  const from = days[0]; const until = new Date(days[days.length - 1]); until.setDate(until.getDate() + 1);
  const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const today = dayKey(now);
  const count = history[today] || 0; const focused = minutes[today] || 0;
  const delta = count - (history[dayKey(yesterday)] || 0);
  const minuteDelta = focused - (minutes[dayKey(yesterday)] || 0);
  const values = days.map(d => minutes[dayKey(d)] || 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const selected = records.filter(r => r.endedAt >= +from && r.endedAt < +until);
  const ranking = new Map<string, number>();
  selected.forEach(r => ranking.set(r.task || "Unclassified", (ranking.get(r.task || "Unclassified") || 0) + r.minutes));
  const recorded = selected.reduce((s, r) => s + r.minutes, 0);
  if (sum > recorded) ranking.set("Old sessions", sum - recorded);
  const hours = hourlyMinutes(records, from, until);
  const maxHour = Math.max(1, ...hours);
  const chartValues = period === "Year" ? Array.from({ length: 12 }, (_, m) => days.reduce((s, d, i) => s + (d.getMonth() === m ? values[i] : 0), 0)) : values;
  const maxValue = Math.max(1, ...chartValues);
  const visibleValues = chartValues.filter((_, i) => period === "Year" ? new Date(anchor.getFullYear(), i, 1) <= now : dayKey(days[i]) <= today);
  const points = visibleValues.map((v, i) => `${18 + i * 284 / Math.max(1, chartValues.length - 1)},${135 - v / maxValue * 105}`);
  const label = period === "Year" ? String(anchor.getFullYear()) : period === "Month" ? anchor.toLocaleDateString("en", { month: "long", year: "numeric" }) : period === "Day" ? from.toLocaleDateString("en", { month: "short", day: "numeric" }) : `${from.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en", { month: "short", day: "numeric" })}`;
  const yearDays = periodDays(new Date(year, 0, 1), "Year");
  const weekDays = periodDays(anchor, "Week");
  const elapsedDays = days.filter(d => dayKey(d) <= today).length;
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ history, minutes, records }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `pomodoro-${today}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="analytics" aria-label="Focus Statistics">
    <header className="analytics-header"><button className="round-button" onClick={onClose} aria-label="Close statistics">×</button><h1>Focus Statistics</h1><button className="round-button" onClick={exportData} aria-label="Export statistics" title="Export JSON">↗</button></header>
    <div className="metric-grid">
      <article className="stat-card metric"><h2>Today's Pomos</h2><small>{Math.abs(delta)} from yesterday <em>{delta >= 0 ? "↑" : "↓"}</em></small><strong>{count}</strong></article>
      <article className="stat-card metric"><h2>Today's Focus</h2><small>{duration(Math.abs(minuteDelta))} from yesterday <em>{minuteDelta >= 0 ? "↑" : "↓"}</em></small><strong>{duration(focused)}</strong></article>
      <article className="stat-card metric compact"><h2>Total Pomos</h2><strong>{Object.values(history).reduce((a, b) => a + b, 0)}</strong></article>
      <article className="stat-card metric compact"><h2>Total Focus</h2><strong>{duration(Object.values(minutes).reduce((a, b) => a + b, 0))}</strong></article>
    </div>
    <article className="stat-card"><div className="card-heading"><h2>Details</h2><button className="text-button" onClick={() => setAnchor(new Date())}>Today</button></div>
      <div className="period-tabs">{(["Day", "Week", "Month", "Year"] as Period[]).map(p => <button key={p} className={period === p ? "selected" : ""} aria-pressed={period === p} onClick={() => setPeriod(p)}>{p}</button>)}</div>
      <div className="date-nav"><button aria-label="Previous period" onClick={() => setAnchor(shiftPeriod(anchor, period, -1))}>‹</button><span>{label}</span><button aria-label="Next period" disabled={+until > +now} onClick={() => setAnchor(shiftPeriod(anchor, period, 1))}>›</button></div>
      <div className={`focus-donut ${sum ? "has-data" : ""}`}><div><strong>{duration(sum)}</strong><span>{period.toLowerCase()} focus</span></div></div>
      <div className="card-heading"><h3>Focus Ranking</h3><span>{selected.length} records</span></div>
      {sum === 0 && <p className="empty-chart">No focus sessions in this period yet.</p>}
      {[...ranking].sort((a, b) => b[1] - a[1]).map(([name, value]) => <div className="rank" key={name}><div><span>{name}</span><span>{duration(value)} · {Math.round(value / Math.max(sum, 1) * 100)}%</span></div><progress value={value} max={Math.max(sum, 1)} /></div>)}
    </article>
    <article className="stat-card"><div className="card-heading"><h2>Trends</h2><span>{period}</span></div>
      <svg className="trend-chart" viewBox="0 0 320 165" role="img" aria-label={`${label}: ${duration(sum)} focus`}>
        <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".4"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
        {[30, 82, 135].map(y => <line key={y} x1="18" x2="302" y1={y} y2={y} className="chart-grid"/>)}
        <polygon points={`18,135 ${points.join(" ")} ${points[points.length - 1]?.split(",")[0] || 18},135`} fill="url(#trend-fill)"/>
        <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round"/>
        {points.map((point, i) => <circle key={i} cx={point.split(",")[0]} cy={point.split(",")[1]} r={chartValues.length > 12 ? 2 : 3.5} fill="var(--text)" stroke="var(--accent)" strokeWidth="2"><title>{period === "Year" ? new Date(anchor.getFullYear(), i, 1).toLocaleDateString("en", { month: "short" }) : dayKey(days[i])}: {duration(chartValues[i])}</title></circle>)}
        <text x="18" y="158">{period === "Year" ? "Jan" : from.toLocaleDateString("en", { month: "short", day: "numeric" })}</text><text x="302" y="158" textAnchor="end">{period === "Year" ? "Dec" : days[days.length - 1].toLocaleDateString("en", { month: "short", day: "numeric" })}</text>
      </svg><div className="card-heading average"><span>Daily Average</span><strong>{duration(sum / Math.max(1, elapsedDays))}</strong></div>
    </article>
    <article className="stat-card"><div className="card-heading"><h2>Focus Record</h2><span>{selected.length}</span></div>
      <div className="record-list">{selected.slice().reverse().map(r => <div className="focus-record" key={r.id}><span className="record-icon">◴</span><div><b>{r.task || "Unclassified"}</b><small>{new Date(r.endedAt).toLocaleDateString("en", { month: "short", day: "numeric" })} · {new Date(r.endedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</small></div><span>{duration(r.minutes)}</span></div>)}</div>
      {!selected.length && <p className="empty-chart">Your completed sessions will appear here.</p>}
    </article>
    <article className="stat-card"><div className="card-heading"><h2>Timeline</h2><span>Week of {weekDays[0].toLocaleDateString("en", { month: "short", day: "numeric" })}</span></div>
      <div className="timeline"><div className="timeline-hours">{["00:00", "06:00", "12:00", "18:00", "24:00"].map(t => <span key={t}>{t}</span>)}</div>
        {weekDays.map(d => { const end = new Date(d); end.setDate(end.getDate() + 1); return <div className="timeline-day" key={dayKey(d)}>{records.flatMap(r => r.segments.map((s, i) => { const start = Math.max(+d, s.start); const stop = Math.min(+end, s.end); return stop > start ? <i key={`${r.id}-${i}`} title={`${r.task || "Focus"} · ${duration((stop - start) / 60000)}`} style={{ top: `${(start - +d) / (+end - +d) * 100}%`, height: `${Math.max(.8, (stop - start) / (+end - +d) * 100)}%` }}/> : null; }))}<span>{d.toLocaleDateString("en", { weekday: "short" })}</span></div>; })}
      </div><p className="chart-note">Active focus time from completed sessions only.</p>
    </article>
    <article className="stat-card"><div className="card-heading"><h2>Most Focused Time</h2></div><p className="chart-note">{label} · active focus minutes</p>
      <div className="hour-chart">{hours.map((value, h) => <div className="hour-column" key={h} title={`${String(h).padStart(2, "0")}:00 · ${duration(value)}`}><i style={{ height: `${value / maxHour * 100}%` }}/></div>)}</div><div className="chart-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      {!hours.some(Boolean) && <p className="empty-chart">Hourly data will appear as you complete new sessions.</p>}
    </article>
    <article className="stat-card"><div className="card-heading"><h2>Year Grids</h2><div className="date-nav"><button aria-label="Previous year" onClick={() => setYear(year - 1)}>‹</button><span>{year}</span><button aria-label="Next year" disabled={year >= now.getFullYear()} onClick={() => setYear(year + 1)}>›</button></div></div>
      <div className="chart-labels"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span></div><div className="year-grid" style={{ gridTemplateColumns: `repeat(${Math.ceil((yearDays.length + (yearDays[0].getDay() + 6) % 7) / 7)}, 1fr)` }}>{Array.from({ length: (yearDays[0].getDay() + 6) % 7 }, (_, i) => <i className="grid-spacer" key={`blank-${i}`}/>)}{yearDays.map(d => { const value = minutes[dayKey(d)] || 0; return <i key={dayKey(d)} className={`heat-${value === 0 ? 0 : value < 60 ? 1 : value < 180 ? 2 : value < 300 ? 3 : 4}`} title={`${dayKey(d)} · ${duration(value)}`}/>; })}</div>
      <div className="heat-legend">{["0m", "<1h", "1–3h", "3–5h", "5h+"].map((text, i) => <span key={text}><i className={`heat-${i}`}/>{text}</span>)}</div>
    </article>
    <p className="analytics-footnote">Previous totals are preserved. Task and hourly details are recorded for newly completed sessions.</p>
  </section>;
}


