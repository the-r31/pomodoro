import { supabase } from "./supabase-client";
import { validateSnapshot } from "./cloud-data";
import type { CloudRow, Snapshot } from "./cloud-data";
export function cloudError(error: { message: string; code?: string }) {
  if (["PGRST205", "42P01", "42501"].includes(error.code || "")) return new Error("Cloud setup is not finished yet. The project owner needs to enable personal sync.");
  return new Error(error.message);
}
export async function fetchCloud(userId: string): Promise<CloudRow | null> {
  const { data, error } = await supabase!.from("pomodoro_sync").select("user_id,revision,data").eq("user_id", userId).maybeSingle();
  if (error) throw cloudError(error);
  if (data) {
    validateSnapshot(data.data);
    if (!Number.isSafeInteger(data.revision) || data.revision < 1 || data.user_id !== userId) throw new Error("Invalid sync revision.");
  }
  return data;
}
export async function fetchCloudRevision(userId: string): Promise<number | null> {
  const { data, error } = await supabase!.from("pomodoro_sync").select("revision").eq("user_id", userId).maybeSingle();
  if (error) throw cloudError(error);
  if (data && (!Number.isSafeInteger(data.revision) || data.revision < 1)) throw new Error("Invalid sync revision.");
  return data?.revision ?? null;
}
export async function pushCloud(userId: string, revision: number, snapshot: Snapshot): Promise<CloudRow | null> {
  validateSnapshot(snapshot);
  if (new Blob([JSON.stringify(snapshot)]).size > 3900000) throw new Error("Workspace is too large to sync. Remove some list photos or export older history first.");
  const query = revision === 0
    ? supabase!.from("pomodoro_sync").insert({ user_id: userId, data: snapshot })
    : supabase!.from("pomodoro_sync").update({ data: snapshot }).eq("user_id", userId).eq("revision", revision);
  const { data, error } = await query.select("user_id,revision,data").maybeSingle();
  if (error?.code === "23505") return null;
  if (error) throw cloudError(error);
  return data;
}
