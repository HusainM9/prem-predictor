/**
 * Supabase returns opaque JSON in `message` when OAuth fails (e.g. provider disabled).
 * Map known cases to something actionable.
 */
export function formatOAuthInitError(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  const lower = raw.toLowerCase();
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return (
      "Google sign-in isn’t enabled for this project yet. "
      + "In Supabase: Authentication → Providers → Google → turn it on, then add your Google OAuth Client ID and Client Secret from Google Cloud Console."
    );
  }
  return raw || "Couldn’t start Google sign-in. Try again.";
}
