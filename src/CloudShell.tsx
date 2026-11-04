import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import { supabase } from "./supabase-client";
import { applySnapshot, capture, cloudKeys, decideSync, fingerprint } from "./cloud-data";
import type { Binding, CloudRow, Snapshot } from "./cloud-data";
import { fetchCloud, fetchCloudRevision, pushCloud } from "./cloud-remote";
import "./CloudShell.css";

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const blank = (): Snapshot => ({ format: 1, values: Object.fromEntries(cloudKeys.map(k => [k, k === "pomo-workspace" ? '{"tasks":[],"activities":[]}' : null])) });
const download = (data: unknown, name: string) => { const a = document.createElement("a"); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
export default function CloudShell() {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
      if (sessionRef.current?.user.id !== value?.user.id) { generation.current++; conflictRef.current = null; setConflict(null); setChoice(null); }
      sessionRef.current = value; setSession(value); setReady(true);
    };
    void supabase.auth.getSession().then(({ data, error }) => { if (error && alive) setError(error.message); accept(data.session); }).catch(() => { if (alive) { setReady(true); setError("Could not restore your login. Your local data is still available."); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => accept(value));
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
  const auth = async () => {
    if (!supabase || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
      if (mode === "signup" && !result.data.session) setMessage("Check your email to confirm your account, then return here and sign in. If the confirmation link opens an unavailable page, return here and try signing in after confirming.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  };
  const prepare = async () => {
    if (!session || busy) return; setBusy(true); setError("");
    const uid = session.user.id;
    try { const row = await fetchCloud(uid); if (sessionRef.current?.user.id === uid) setChoice({ row }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); }
    finally { setBusy(false); }
  };
  const connect = async (source: "cloud" | "device" | "empty" | "backup") => {
    if (!session || !choice || busy || inFlight.current) return;
    setBusy(true); inFlight.current = true; setError(""); const uid = session.user.id;
    try {
      const owner = localStorage.getItem("pomo-data-owner") || "guest";
      if (source === "device" && owner !== "guest" && owner !== uid) throw new Error("Sign out of the previous account before uploading device data.");
      backupCurrent();
      if (source === "backup") {
        const backup = read<{ data: Snapshot; binding: Binding } | null>(`pomo-cloud-backup:${uid}`, null);
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
      backupCurrent();
      const guest = read<{ data: Snapshot; timer: string | null; reminders: string | null } | null>("pomo-cloud-backup:guest", null);
      const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) throw error;
      replaceWorkspace(guest?.data || blank(), true);
      if (guest?.timer) { const timer = JSON.parse(guest.timer); localStorage.setItem("pomo-timer", JSON.stringify({ ...timer, running: false, segmentStart: 0 })); }
      localStorage.setItem("pomo-data-owner", "guest"); binding.current = null; localStorage.removeItem("pomo-cloud-binding");
      setEpoch(e => e + 1); setStatus("Local only"); setMessage("Signed out. Account data is backed up on this device; your local workspace has been restored.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setBusy(false); }
  };
  const connected = !!session && binding.current?.userId === session.user.id && localStorage.getItem("pomo-data-owner") === session.user.id;
  return <><App key={epoch}/>{connected && !open && (conflict || error) && <button className="cloud-attention" onClick={() => setOpen(true)}>{conflict ? "Review sync changes" : "Sync needs attention"}</button>}{open && <div className="cloud-overlay" role="dialog" aria-modal="true" aria-label="Account and sync" onKeyDown={e => {
    if (e.key === "Escape" && !busy) setOpen(false);
    if (e.key === "Tab") { const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input, a')).filter(el => !el.hasAttribute('disabled')); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  }}><section className="cloud-panel"><header><h2>Account & sync</h2><button autoFocus aria-label="Close account" disabled={busy} onClick={() => setOpen(false)}>×</button></header><p className="cloud-caption">Your planner, across your devices.</p>
    {!supabase ? <p>Cloud sync is not configured in this build. You can keep using the app locally.</p> : !ready ? <p>Checking your account…</p> : !session ? <><div className="cloud-tabs"><button aria-pressed={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button><button aria-pressed={mode === "signup"} onClick={() => { setMode("signup"); setError(""); }}>Create account</button></div><form onSubmit={e => { e.preventDefault(); void auth(); }}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button></form><p className="cloud-note">Email confirmation is required for new accounts. Signing in does not upload your existing data until you connect sync.</p></> : <><p className="cloud-email">{session.user.email}</p><div className="cloud-status">{connected ? paused ? "Sync paused" : status : "Signed in · sync not connected"}{lastSync && connected && <small>Last synced {lastSync}</small>}</div>
      {!connected && <><button className="primary" disabled={busy} onClick={() => void prepare()}>Check cloud workspace</button>{choice && <div className="sync-choice">{choice.row ? <><h3>Cloud workspace found</h3><p>Load this account's data on this device. The current local workspace is backed up first. The saved timer resumes paused on this device.</p><button disabled={busy} onClick={() => void connect("cloud")}>Use cloud workspace</button></> : <><h3>Set up personal sync</h3><p>Choose what to upload. Your data will be stored in your account.</p><button disabled={busy || !["guest", session.user.id].includes(localStorage.getItem("pomo-data-owner") || "guest")} onClick={() => void connect("device")}>Upload this device's workspace</button><button disabled={busy} onClick={() => void connect("empty")}>Start with an empty workspace</button></>}</div>}</>}
      {!connected && choice && read<{ binding?: Binding } | null>(`pomo-cloud-backup:${session.user.id}`, null)?.binding?.userId === session.user.id && <div className="sync-choice"><p>This device has a saved account copy, which may contain unsynced changes.</p><button disabled={busy} onClick={() => void connect("backup")}>Resume saved account copy</button></div>}
      {connected && <><div className="cloud-actions"><button disabled={busy || paused} onClick={() => void synchronize()}>Sync now</button><button disabled={busy} onClick={() => { const next = !paused; pausedRef.current = next; setPaused(next); localStorage.setItem("pomo-sync-paused", next ? "1" : "0"); if (!next) void synchronize(); }}>{paused ? "Resume sync" : "Pause sync"}</button></div><p className="cloud-note">Tasks, lists, habits, settings, focus statistics and timer checkpoints sync about every 15 seconds while the app is open. Timer controls request an immediate sync. On another device, the saved timer opens paused; press Start to continue.</p></>}
      {conflict && <div className="sync-choice"><h3>Both devices made changes</h3><p>Choose which complete workspace to keep. This version does not automatically combine edits. Both versions are backed up on this device before replacement.</p><div className="cloud-actions"><button onClick={() => download(capture(localStorage), "pomodoro-device.json")}>Download device copy</button><button onClick={() => download(conflict.data, "pomodoro-cloud.json")}>Download cloud copy</button></div><button disabled={busy} onClick={() => void resolve("cloud")}>Keep cloud version</button><button disabled={busy} onClick={() => void resolve("device")}>Keep this device's version</button></div>}
      <button className="sign-out" disabled={busy} onClick={() => void signOut()}>Sign out on this device</button><p className="cloud-note">Signing out keeps a local backup of this account's changes, then restores your local workspace.</p></>}
    {message && <p role="status" className="cloud-message">{message}</p>}{error && <p role="alert" className="cloud-error">{error}</p>}
    <button className="backup-button" onClick={() => download(capture(localStorage), "pomodoro-workspace-backup.json")}>Download workspace backup</button>
  </section></div>}</>;
}

