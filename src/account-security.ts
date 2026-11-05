export function recoveryToken(link: string, projectUrl: string): string {
  let url: URL;
  try { url = new URL(link.trim()); } catch { throw new Error("Paste the original recovery link from your email."); }
  const project = new URL(projectUrl);
  const token = url.searchParams.get("token_hash") || url.searchParams.get("token");
  if (url.origin !== project.origin || url.pathname !== "/auth/v1/verify" || url.username || url.password ||
      url.searchParams.get("type") !== "recovery" || !token || token.length > 2048) {
    throw new Error("Use the recovery link sent by this app. Copy the original link without opening it.");
  }
  return token;
}

export function recoveryError(error: { code?: string; message: string }): string {
  if (error.code === "otp_expired") return "This recovery link has expired or was already used. Request a new recovery email.";
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return "Too many attempts. Please wait before trying again.";
  return error.message;
}

export function workspaceLocked(owner: string | null, userId: string | undefined): boolean {
  return !!owner && owner !== "guest" && owner !== userId;
}
