import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientId, isRateLimited } from "@/lib/rate-limit";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickFromScore(home: number, away: number): "H" | "D" | "A" {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

/**
 * Community stats for a finished fixture: % correct result vs % exact score (global predictions only).
 */
export async function GET(req: Request) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 120, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { searchParams } = new URL(req.url);
    const fixtureId = searchParams.get("fixtureId")?.trim() ?? "";
    if (!fixtureId || !UUID_REGEX.test(fixtureId)) {
      return NextResponse.json({ error: "Invalid or missing fixtureId" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: fx, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_goals, away_goals, status")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 });
    if (!fx) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const hg = fx.home_goals;
    const ag = fx.away_goals;
    const hasResult =
      typeof hg === "number" &&
      typeof ag === "number" &&
      Number.isInteger(hg) &&
      Number.isInteger(ag) &&
      String(fx.status ?? "").toLowerCase() === "finished";

    if (!hasResult) {
      return NextResponse.json({
        has_result: false,
        total_predictions: 0,
        pct_correct_result: null,
        pct_exact_score: null,
      });
    }

    const actualPick = pickFromScore(hg, ag);

    const { data: preds, error: pErr } = await supabase
      .from("predictions")
      .select("pred_home_goals, pred_away_goals")
      .eq("fixture_id", fixtureId)
      .is("league_id", null);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const rows = (preds ?? []).filter(
      (p) =>
        p.pred_home_goals != null &&
        p.pred_away_goals != null &&
        Number.isInteger(Number(p.pred_home_goals)) &&
        Number.isInteger(Number(p.pred_away_goals))
    );

    const total = rows.length;
    if (total === 0) {
      return NextResponse.json({
        has_result: true,
        total_predictions: 0,
        pct_correct_result: null,
        pct_exact_score: null,
      });
    }

    let correctResult = 0;
    let exactScore = 0;
    for (const p of rows) {
      const ph = Number(p.pred_home_goals);
      const pa = Number(p.pred_away_goals);
      const predPick = pickFromScore(ph, pa);
      if (predPick === actualPick) correctResult += 1;
      if (ph === hg && pa === ag) exactScore += 1;
    }

    const pct = (n: number) => Math.round((1000 * n) / total) / 10;

    return NextResponse.json({
      has_result: true,
      total_predictions: total,
      pct_correct_result: pct(correctResult),
      pct_exact_score: pct(exactScore),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
