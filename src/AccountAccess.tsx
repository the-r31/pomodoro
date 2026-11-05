import { useState } from "react";
import { supabase } from "./supabase-client";
import { recoveryError, recoveryToken } from "./account-security";

export default function AccountAccess() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = async (resend = false) => {
    if (!supabase || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = resend ? await supabase.auth.resend({ type: "signup", email: email.trim() })
        : mode === "reset" ? await supabase.auth.resetPasswordForEmail(email.trim())
        : mode === "signup" ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw new Error(recoveryError(result.error));
      setPassword("");
      if (mode === "reset") setMessage("If this email has an account, a recovery email is on its way. Copy the recovery link from that email and paste it below without opening it.");
      else if (resend || mode === "signup") setMessage("Check your email to confirm your account, then return here to sign in.");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <>
    <div className="cloud-tabs">{(["signin", "signup"] as const).map(value => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); setError(""); setMessage(""); setPassword(""); }}>{value === "signin" ? "Sign in" : "Create account"}</button>)}</div>
    {mode === "reset" && <h3 className="account-section-title">Recover your account</h3>}
    <form onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
      {mode !== "reset" && <><label htmlFor="account-password">Password</label><div className="password-field"><input id="account-password" type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/><button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>{mode === "signup" && <p className="cloud-note">Use at least 8 characters.</p>}</>}
      <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "reset" ? "Send recovery email" : mode === "signup" ? "Create account" : "Sign in"}</button>
      <div className="account-help"><button type="button" disabled={busy} onClick={() => { setMode(mode === "reset" ? "signin" : "reset"); setError(""); setMessage(""); setPassword(""); }}>{mode === "reset" ? "Back to sign in" : "Forgot password?"}</button><button type="button" disabled={busy} onClick={e => { if (e.currentTarget.form?.querySelector<HTMLInputElement>('input[type="email"]')?.reportValidity()) void run(true); }}>Resend confirmation</button></div>
    </form>
    {message && <p role="status" className="cloud-message">{message}</p>}{error && <p role="alert" className="cloud-error">{error}</p>}
    {mode === "reset" && <RecoveryLink/>}
    <p className="cloud-note">Your local tasks stay on this device until you choose to connect sync.</p>
  </>;
}

function RecoveryLink() {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form onSubmit={async e => {
    e.preventDefault(); if (!supabase || busy) return; setBusy(true); setError("");
    try {
      const token = recoveryToken(link, import.meta.env.VITE_SUPABASE_URL);
      // Send only the token to our configured auth server; never navigate to the pasted URL.
      const result = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
      if (result.error) throw new Error(recoveryError(result.error));
      setLink("");
    } catch (err) { setError(err instanceof Error ? err.message : "Invalid recovery link."); }
    finally { setBusy(false); }
  }}><label>Recovery link<input type="password" autoComplete="off" required value={link} onChange={e => setLink(e.target.value)} disabled={busy}/></label><button className="primary" disabled={busy}>{busy ? "Verifying…" : "Verify recovery link"}</button>{error && <p className="cloud-error" role="alert">{error}</p>}</form>;
}

export function AccountProfile({ name, recovering, onSaved }: { name: string; recovering: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState(name);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const save = async (security: boolean) => {
    if (!supabase || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      if (security && password !== confirm) throw new Error("Passwords do not match.");
      const result = await supabase.auth.updateUser(security ? { password } : { data: { display_name: draft.trim() } });
      if (result.error) throw result.error;
      setPassword(""); setConfirm(""); setMessage(security ? "Password updated." : "Profile saved."); if (security) onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save changes."); }
    finally { setBusy(false); }
  };
  return <><details className="account-section"><summary>Profile</summary><form onSubmit={e => { e.preventDefault(); void save(false); }}><label>Display name<input maxLength={60} required autoComplete="nickname" value={draft} onChange={e => setDraft(e.target.value)} disabled={busy}/></label><button className="primary" disabled={busy}>Save profile</button></form></details>
    <details className="account-section" open={recovering || undefined}><summary>Security</summary><form onSubmit={e => { e.preventDefault(); void save(true); }}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy}/></label><button className="primary" disabled={busy}>Update password</button></form></details>
    {message && <p role="status" className="cloud-message">{message}</p>}{error && <p role="alert" className="cloud-error">{error}</p>}</>;
}
