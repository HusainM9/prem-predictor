import { NextResponse } from "next/server";

/**
 * Cron endpoint: run map-odds → fetch-current → lock-odds in sequence.
 *
 * Auth: set CRON_SECRET in env. Vercel Cron automatically sends
 *   Authorization: Bearer <CRON_SECRET> when invoking this path.
 * For external cron services, call with ?secret=<CRON_SECRET> or the same header.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(req.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 500 }
    );
  }

  if (bearer !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.APP_URL || "http://localhost:3000";

  const results: { step: string; ok: boolean; status: number; body?: unknown }[] = [];

  try {
    // 1) Map new fixtures to Odds API events
    const mapRes = await fetch(`${baseUrl}/api/admin/map-odds`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const mapBody = await mapRes.json().catch(() => ({}));
    results.push({
      step: "map-odds",
      ok: mapRes.ok,
      status: mapRes.status,
      body: mapBody,
    });

    // 2) Fetch current odds for upcoming fixtures
    const fetchRes = await fetch(`${baseUrl}/api/odds/fetch-current`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const fetchBody = await fetchRes.json().catch(() => ({}));
    results.push({
      step: "fetch-current",
      ok: fetchRes.ok,
      status: fetchRes.status,
      body: fetchBody,
    });

    // 3) Lock odds for fixtures in the next 24h
    const lockRes = await fetch(`${baseUrl}/api/admin/lock-odds`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const lockBody = await lockRes.json().catch(() => ({}));
    results.push({
      step: "lock-odds",
      ok: lockRes.ok,
      status: lockRes.status,
      body: lockBody,
    });

    const allOk = results.every((r) => r.ok);
    return NextResponse.json(
      {
        success: allOk,
        results,
      },
      { status: allOk ? 200 : 207 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        results,
      },
      { status: 500 }
    );
  }
}
