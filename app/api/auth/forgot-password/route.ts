import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientId } from "@/lib/rate-limit";

const WINDOW_MS = 60 * 60 * 1000;
const MIN_SECONDS_BETWEEN_REQUESTS = 30;
const MAX_REQUESTS_PER_HOUR = 5;
const ATTEMPTS = new Map<string, number[]>();

function getBaseUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return new URL(req.url).origin;
}

function checkAndRecord(key: string) {
  const now = Date.now();
  const list = (ATTEMPTS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const last = list[list.length - 1] ?? 0;

  const minIntervalMs = MIN_SECONDS_BETWEEN_REQUESTS * 1000;
  const waitMs = last > 0 ? minIntervalMs - (now - last) : 0;
  if (waitMs > 0) {
    ATTEMPTS.set(key, list);
    return {
      limited: true as const,
      reason: "cooldown" as const,
      retryAfterSeconds: Math.ceil(waitMs / 1000),
    };
  }

  if (list.length >= MAX_REQUESTS_PER_HOUR) {
    const firstInWindow = list[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - firstInWindow)) / 1000));
    ATTEMPTS.set(key, list);
    return {
      limited: true as const,
      reason: "hourly_limit" as const,
      retryAfterSeconds,
    };
  }

  list.push(now);
  ATTEMPTS.set(key, list);
  return { limited: false as const };
}

/**
 * Send password reset email. Always returns a generic success message when accepted.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!emailRaw || !emailRaw.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const clientId = getClientId(req);
    const key = `${clientId}:${emailRaw}`;
    const limit = checkAndRecord(key);
    if (limit.limited) {
      return NextResponse.json(
        {
          error:
            limit.reason === "cooldown"
              ? `Please wait ${limit.retryAfterSeconds}s before requesting another reset email.`
              : "Too many reset requests. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, anonKey);

    const redirectTo = `${getBaseUrl(req).replace(/\/+$/, "")}/reset-password`;
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailRaw, { redirectTo });
    if (resetErr) {
      return NextResponse.json(
        { error: "Unable to send reset email right now. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

