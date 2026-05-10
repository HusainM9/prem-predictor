import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = "2025/26";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(req.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (bearer !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    return NextResponse.json({ error: "ADMIN_SECRET is not set" }, { status: 500 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ?? DEFAULT_SEASON;
  const nowIso = new Date().toISOString();

  const { data: latestPlayed, error: latestErr } = await supabase
    .from("fixtures")
    .select("gameweek, kickoff_time")
    .eq("season", season)
    .lte("kickoff_time", nowIso)
    .order("kickoff_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    return NextResponse.json({ error: "Failed loading latest played fixture", details: latestErr.message }, { status: 500 });
  }
  if (!latestPlayed?.gameweek) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "no_played_fixtures_yet",
      season,
    });
  }

  const gameweek = latestPlayed.gameweek as number;
  const { data: gwFixtures, error: gwErr } = await supabase
    .from("fixtures")
    .select("status")
    .eq("season", season)
    .eq("gameweek", gameweek);
  if (gwErr) {
    return NextResponse.json({ error: "Failed loading gameweek fixtures", details: gwErr.message }, { status: 500 });
  }

  const all = gwFixtures ?? [];
  const total = all.length;
  const finished = all.filter((f) => f.status === "finished").length;
  if (total === 0 || finished < total) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "latest_gameweek_not_fully_finished",
      season,
      gameweek,
      finished,
      total,
    });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "http://localhost:3000";

  const scoreRes = await fetch(`${baseUrl}/api/admin/score-gameweek`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminSecret}`,
    },
    body: JSON.stringify({ season, gameweek }),
    cache: "no-store",
  });
  const scoreBody = await scoreRes.json().catch(() => ({}));

  return NextResponse.json(
    {
      success: scoreRes.ok,
      season,
      gameweek,
      status: scoreRes.status,
      result: scoreBody,
    },
    { status: scoreRes.ok ? 200 : 500 }
  );
}

