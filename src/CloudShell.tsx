import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import AccountAccess, { AccountProfile } from "./AccountAccess";
import { supabase } from "./supabase-client";
import { applySnapshot, capture, cloudKeys, decideSync, fingerprint, validateSnapshot } from "./cloud-data";
import type { Binding, CloudRow, Snapshot } from "./cloud-data";
import { fetchCloud, fetchCloudRevision, pushCloud } from "./cloud-remote";
import "./CloudShell.css";
import { workspaceLocked } from "./account-security";

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const blank = (): Snapshot => ({ format: 1, values: Object.fromEntries(cloudKeys.map(k => [k, k === "pomo-workspace" ? '{"tasks":[],"activities":[]}' : null])) });
const download = (data: unknown, name: string) => { const a = document.createElement("a"); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
export default function CloudShell() {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [status, setStatus] = useState("Local only");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const binding = useRef<Binding | null>(read("pomo-cloud-binding", null));
  const [conflict, setConflict] = useState<CloudRow | null>(null);
  const conflictRef = useRef<CloudRow | null>(null);
  const [choice, setChoice] = useState<{ row: CloudRow | null } | null>(null);
  const [paused, setPaused] = useState(() => localStorage.getItem("pomo-sync-paused") === "1");
  const pausedRef = useRef(paused);
  const [lastSync, setLastSync] = useState("");
  const locked = workspaceLocked(localStorage.getItem("pomo-data-owner"), session?.user.id);
  const accountOpen = open || (ready && locked);
  useEffect(() => {
    if (!accountOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [accountOpen]);
  const saveBinding = (row: CloudRow) => {
    const next = { userId: row.user_id, revision: row.revision, base: row.data };
    localStorage.setItem("pomo-cloud-binding", JSON.stringify(next)); binding.current = next;
  };
  const markConflict = (row: CloudRow) => { conflictRef.current = row; setConflict(row); setStatus("Changes need review"); };
  const backupCurrent = () => {
    const owner = localStorage.getItem("pomo-data-owner") || "guest";
    localStorage.setItem(`pomo-cloud-backup:${owner}`, JSON.stringify({ data: capture(localStorage), timer: localStorage.getItem("pomo-timer"), reminders: localStorage.getItem("pomo-reminder-delivery"), binding: binding.current?.userId === owner ? binding.current : null }));
  };
  const replaceWorkspace = (data: Snapshot, resetTimer = false) => {
    applySnapshot(localStorage, data);
    if (!read<{ running?: boolean }>("pomo-timer", {}).running) localStorage.removeItem("pomo-timer");
    if (resetTimer) { localStorage.removeItem("pomo-timer"); localStorage.removeItem("pomo-reminder-delivery"); }
    setEpoch(e => e + 1);
  };
  const synchronize = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    const meta = binding.current;
    if (!userId || !meta || meta.userId !== userId || localStorage.getItem("pomo-data-owner") !== userId || inFlight.current || pausedRef.current || conflictRef.current) return;
    inFlight.current = true; const ticket = generation.current;
    const current = () => ticket === generation.current && sessionRef.current?.user.id === userId;
    try {
      window.dispatchEvent(new Event("pomo-before-sync"));
      if (!navigator.onLine) { setStatus("Offline · changes saved on this device"); return; }
      const local = capture(localStorage);
      setStatus("Syncing…");
      const revision = await fetchCloudRevision(userId);
      if (!current()) return;
      const remote = revision === meta.revision ? { user_id: userId, revision, data: meta.base } : revision === null ? null : await fetchCloud(userId);
      if (!current()) return;
      if (!remote) { setStatus("Cloud workspace unavailable"); throw new Error("The cloud workspace was removed. Your local data is safe. Sign out and reconnect to set up sync again."); }
      const action = decideSync(meta.base, local, remote.data);
      if (action === "conflict") { markConflict(remote); return; }
      if (action === "push") {
        const saved = await pushCloud(userId, remote.revision, local);
        if (!current()) return;
        if (!saved) { const latest = await fetchCloud(userId); if (current() && latest) markConflict(latest); return; }
        saveBinding(saved);
      } else if (action === "pull") {
        // Edits made during the fetch must never be replaced.
        if (fingerprint(capture(localStorage)) !== fingerprint(local)) { markConflict(remote); return; }
        backupCurrent(); replaceWorkspace(remote.data); saveBinding(remote);
      } else saveBinding(remote);
      setStatus("Synced"); setLastSync(new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })); setError("");
    } catch (e) {
      if (current()) { setStatus("Not synced · local changes are safe"); setError(e instanceof Error ? e.message : "Could not sync. Please retry."); }
    } finally { inFlight.current = false; }
  }, []);
  useEffect(() => {
    const show = () => setOpen(true); window.addEventListener("pomo-open-account", show);
    if (!supabase) { setReady(true); return () => window.removeEventListener("pomo-open-account", show); }
    let alive = true;
    const accept = (value: Session | null) => {
      if (!alive) return;
      if (sessionRef.current?.user.id !== value?.user.id) { window.dispatchEvent(new Event("pomo-before-sync")); setLastSync(""); generation.current++; conflictRef.current = null; setConflict(null); setChoice(null); }
      sessionRef.current = value; setSession(value); setReady(true); if (!value) setRecovering(false);
    };
    void supabase.auth.getSession().then(({ data, error }) => { if (error && alive) setError(error.message); accept(data.session); }).catch(() => { if (alive) { setReady(true); setError("Could not restore your login. Your local data is still available."); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => { if (event === "PASSWORD_RECOVERY") { setRecovering(true); setOpen(true); } accept(value); });
    return () => { alive = false; subscription.unsubscribe(); window.removeEventListener("pomo-open-account", show); };
  }, []);
  useEffect(() => {
    const tick = () => { void synchronize(); };
    let pending: ReturnType<typeof setTimeout>;
    const requested = () => { clearTimeout(pending); pending = setTimeout(tick, 300); };
    tick(); const id = setInterval(tick, 15000); window.addEventListener("online", tick);
    window.addEventListener("pomo-sync-request", requested);
    return () => { clearInterval(id); clearTimeout(pending); window.removeEventListener("online", tick); window.removeEventListener("pomo-sync-request", requested); };
  }, [session?.user.id, synchronize]);
  const prepare = async () => {
    if (!session || busy) return; setBusy(true); setError("");
    const uid = session.user.id;
    try { const row = await fetchCloud(uid); if (sessionRef.current?.user.id === uid) setChoice({ row }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (accountOpen && session && !recovering && !(binding.current?.userId === session.user.id && localStorage.getItem("pomo-data-owner") === session.user.id)) void prepare();
  }, [accountOpen, session?.user.id, recovering]);
  const connect = async (source: "cloud" | "device" | "empty" | "backup") => {
    if (!session || !choice || busy || inFlight.current) return;
    setBusy(true); inFlight.current = true; setError(""); const uid = session.user.id;
    try {
      const owner = localStorage.getItem("pomo-data-owner") || "guest";
      if (source === "device" && owner !== "guest" && owner !== uid) throw new Error("Sign out of the previous account before uploading device data.");
      window.dispatchEvent(new Event("pomo-before-sync"));
      const savedBackup = read<{ data: Snapshot; binding: Binding } | null>(`pomo-cloud-backup:${uid}`, null);
      backupCurrent();
      if (source === "backup") {
        const backup = savedBackup;
        if (!backup || backup.binding?.userId !== uid) throw new Error("No resumable backup found for this account.");
        replaceWorkspace(backup.data, true);
        localStorage.setItem("pomo-data-owner", uid);
        saveBinding({ user_id: uid, revision: backup.binding.revision, data: backup.binding.base });
        setChoice(null); setStatus("Local backup restored · sync pending");
        pausedRef.current = false; setPaused(false); localStorage.setItem("pomo-sync-paused", "0");
        return;
      }
      let row = choice.row;
      if (source !== "cloud") {
        if (row) throw new Error("This account already has cloud data. Download it first instead of replacing it.");
        row = await pushCloud(uid, 0, source === "device" ? capture(localStorage) : blank());
        if (!row) throw new Error("Another device created this workspace. Check cloud data again.");
      }
      if (!row || sessionRef.current?.user.id !== uid) return;
      // Upload does not reset a running guest timer; account switches do.
      if (source !== "device") replaceWorkspace(row.data, true);
      localStorage.setItem("pomo-data-owner", uid); saveBinding(row);
      pausedRef.current = false; setPaused(false); localStorage.setItem("pomo-sync-paused", "0");
      setChoice(null); setStatus("Synced"); setMessage("Personal sync is connected. Changes sync while the app is open.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect sync."); }
    finally { setBusy(false); inFlight.current = false; }
  };
  const resolve = async (source: "cloud" | "device") => {
    if (!session || !conflict || busy || inFlight.current) return;
    setBusy(true); inFlight.current = true; const uid = session.user.id;
    try {
      const local = capture(localStorage);
      localStorage.setItem("pomo-conflict-backup", JSON.stringify({ at: Date.now(), userId: uid, local, cloud: conflict.data }));
      if (source === "cloud") { replaceWorkspace(conflict.data); saveBinding(conflict); }
      else {
        const row = await pushCloud(uid, conflict.revision, local);
        if (sessionRef.current?.user.id !== uid) return;
        if (!row) { const latest = await fetchCloud(uid); if (latest) markConflict(latest); throw new Error("Cloud data changed again. Review the latest versions before choosing."); }
        saveBinding(row);
      }
      conflictRef.current = null; setConflict(null); setStatus("Synced"); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not resolve changes."); }
    finally { setBusy(false); inFlight.current = false; }
  };
  const signOut = async () => {
    if (!supabase || busy || inFlight.current) return;
    setBusy(true); generation.current++;
    try {
      window.dispatchEvent(new Event("pomo-before-sync"));
      backupCurrent();
      const guest = read<{ data: Snapshot; timer: string | null; reminders: string | null } | null>("pomo-cloud-backup:guest", null);
      validateSnapshot(guest?.data || blank());
      const guestTimer = guest?.timer ? JSON.parse(guest.timer) : null;
      const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) throw error;
      replaceWorkspace(guest?.data || blank(), true);
      if (guestTimer) { const timer = guestTimer; localStorage.setItem("pomo-timer", JSON.stringify({ ...timer, running: false, segmentStart: 0 })); }
      localStorage.setItem("pomo-data-owner", "guest"); binding.current = null; localStorage.removeItem("pomo-cloud-binding");
      setEpoch(e => e + 1); setStatus("Local only"); setMessage("Signed out. Account data is backed up on this device; your local workspace has been restored.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setBusy(false); }
  };
  const conflictBackup = read<{ userId: string; local: Snapshot; cloud: Snapshot } | null>("pomo-conflict-backup", null);
  const restoreConflict = () => {
    if (!session || conflictBackup?.userId !== session.user.id || busy || inFlight.current || locked) return;
    try {
      validateSnapshot(conflictBackup.local);
      window.dispatchEvent(new Event("pomo-before-sync"));
      backupCurrent();
      localStorage.setItem("pomo-sync-paused", "1"); pausedRef.current = true; setPaused(true);
      replaceWorkspace(conflictBackup.local, true);
      conflictRef.current = null; setConflict(null);
      setMessage("Device copy restored. Sync is paused so you can review it before resuming."); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore the backup."); }
  };
  const connected = !!session && binding.current?.userId === session.user.id && localStorage.getItem("pomo-data-owner") === session.user.id;
  return <>{!locked && <App key={epoch}/>}{connected && !open && (conflict || error) && <button className="cloud-attention" onClick={() => setOpen(true)}>{conflict ? "Review sync changes" : "Sync needs attention"}</button>}{accountOpen && <div className="cloud-overlay" role="dialog" aria-modal="true" aria-label="Account and sync" onKeyDown={e => {
    if (e.key === "Escape" && !busy && !locked) setOpen(false);
    if (e.key === "Tab") { const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input, a, summary')).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  }}><section className="cloud-panel"><header><h2>Account & sync</h2><button autoFocus aria-label="Close account" disabled={busy || locked} onClick={() => setOpen(false)}>×</button></header><p className="cloud-caption">Your planner, across your devices.</p>{locked && <p role="status" className="cloud-note">Your saved workspace is protected. Sign in to its account to continue, or connect another account's workspace. Unsynced changes remain on this device.</p>}
    {!supabase ? <p>Cloud sync is not configured in this build. You can keep using the app locally.</p> : !ready ? <p>Checking your account…</p> : !session ? <AccountAccess/> : <><div className="account-identity"><span className="account-avatar" aria-hidden="true">{String(session.user.user_metadata.display_name || session.user.email || "?").slice(0, 1).toUpperCase()}</span><div><h3>{String(session.user.user_metadata.display_name || "Your account")}</h3><p className="cloud-email">{session.user.email}</p></div></div>{recovering && <p role="status" className="cloud-message">Recovery verified. Open Security below to set your new password.</p>}<AccountProfile key={session.user.id} name={String(session.user.user_metadata.display_name || "")} recovering={recovering} onSaved={() => setRecovering(false)}/><section className="account-section"><h3 className="account-section-title">Sync & backup</h3><div className="cloud-status">{connected ? paused ? "Sync paused" : status : "Signed in · sync not connected"}{lastSync && connected && <small>Last synced {lastSync}</small>}</div>
      {!connected && <><button className="primary" disabled={busy} onClick={() => void prepare()}>Check cloud workspace</button>{choice && <div className="sync-choice">{choice.row ? <><h3>Cloud workspace found</h3><p>Load this account's data on this device. The current local workspace is backed up first. The saved timer resumes paused on this device.</p><button disabled={busy} onClick={() => void connect("cloud")}>Use cloud workspace</button></> : <><h3>Set up personal sync</h3><p>Choose what to upload. Your data will be stored in your account.</p><button disabled={busy || !["guest", session.user.id].includes(localStorage.getItem("pomo-data-owner") || "guest")} onClick={() => void connect("device")}>Upload this device's workspace</button><button disabled={busy} onClick={() => void connect("empty")}>Start with an empty workspace</button></>}</div>}</>}
      {!connected && choice && read<{ binding?: Binding } | null>(`pomo-cloud-backup:${session.user.id}`, null)?.binding?.userId === session.user.id && <div className="sync-choice"><p>This device has a saved account copy, which may contain unsynced changes.</p><button disabled={busy} onClick={() => void connect("backup")}>Resume saved account copy</button></div>}
      {connected && <><div className="cloud-actions"><button disabled={busy || paused} onClick={() => void synchronize()}>Sync now</button><button disabled={busy} onClick={() => { const next = !paused; pausedRef.current = next; setPaused(next); localStorage.setItem("pomo-sync-paused", next ? "1" : "0"); if (!next) void synchronize(); }}>{paused ? "Resume sync" : "Pause sync"}</button></div><p className="cloud-note">Your planner saves across devices while the app is open. On another device, your timer resumes paused.</p></>}
      {conflict && <div className="sync-choice"><h3>Both devices made changes</h3><p>Compare the copies, then choose one to keep. Both copies are backed up before replacement; edits are not combined.</p><div className="workspace-comparison"><WorkspaceSummary title="This device" data={capture(localStorage)}/><WorkspaceSummary title="Cloud copy" data={conflict.data}/></div><div className="cloud-actions"><button onClick={() => download(capture(localStorage), "pomodoro-device.json")}>Download device copy</button><button onClick={() => download(conflict.data, "pomodoro-cloud.json")}>Download cloud copy</button></div><button disabled={busy} onClick={() => void resolve("cloud")}>Keep cloud version</button><button disabled={busy} onClick={() => void resolve("device")}>Keep this device's version</button></div>}
      {connected && !conflict && conflictBackup?.userId === session?.user.id && <details className="account-section"><summary>Recover previous conflict copy</summary><p className="cloud-note">Restore the device copy saved before your last conflict choice. Your current workspace is backed up first, and sync pauses for review.</p><button disabled={busy} onClick={restoreConflict}>Restore device copy and pause sync</button></details>}
      <button className="backup-button" disabled={locked} onClick={() => download(capture(localStorage), "pomodoro-workspace-backup.json")}>Download workspace backup</button></section><button className="sign-out" disabled={busy} onClick={() => void signOut()}>Sign out on this device</button><p className="cloud-note">Signing out keeps a local backup of this account's changes, then restores your local workspace.</p></>}
    {message && <p role="status" className="cloud-message">{message}</p>}{error && <p role="alert" className="cloud-error">{error}</p>}
    {!session && <button className="backup-button" disabled={locked} onClick={() => download(capture(localStorage), "pomodoro-workspace-backup.json")}>Download workspace backup</button>}
  </section></div>}</>;
}


function WorkspaceSummary({ title, data }: { title: string; data: Snapshot }) {
  const tasks = (() => { try { return JSON.parse(data.values["pomo-workspace"] || '{"tasks":[]}').tasks as { done: boolean; title: string }[]; } catch { return []; } })();
  return <div><h4>{title}</h4><strong>{tasks.length} tasks</strong><small>{tasks.filter(t => t.done).length} completed</small><ul>{tasks.slice(-3).map((task, index) => <li key={index}>{task.title}</li>)}</ul>{tasks.length > 3 && <small>Showing 3 of {tasks.length}</small>}</div>;
}
