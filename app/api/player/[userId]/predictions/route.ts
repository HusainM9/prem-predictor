import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientId, isRateLimited } from "@/lib/rate-limit";
import { canRevealPredictionToViewer } from "@/lib/prediction-privacy";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 60, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { userId } = await params;
    const id = userId?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const gameweekParam = searchParams.get("gameweek");
    const gameweek =
      gameweekParam != null && gameweekParam !== ""
        ? (() => {
            const n = Number(gameweekParam);
            return Number.isInteger(n) && n >= 1 ? n : null;
          })()
        : null;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let viewerId: string | null = null;
    if (token) {
      const supabaseAuth = createClient(supabaseUrl, anonKey);
      const {
        data: { user },
        error: viewerErr,
      } = await supabaseAuth.auth.getUser(token);
      if (!viewerErr && user) viewerId = user.id;
    }
    const isOwner = viewerId === id;

    const nowIso = new Date().toISOString();
    const now = new Date(nowIso);

    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select("id, fixture_id, pred_home_goals, pred_away_goals, pick, points_awarded, bonus_exact_score_points, settled_at")
      .eq("user_id", id)
      .is("league_id", null)
      .order("submitted_at", { ascending: false });

    if (predErr) {
      return NextResponse.json({ error: predErr.message }, { status: 500 });
    }
    if (!predictions?.length) {
      return NextResponse.json({ predictions: [], fixtures: [] });
    }

    const fixtureIds = [...new Set(predictions.map((p) => p.fixture_id))];

    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, home_team, away_team, kickoff_time, gameweek, status, home_goals, away_goals, odds_locked_at")
      .in("id", fixtureIds);

    if (fxErr) {
      return NextResponse.json({ error: fxErr.message }, { status: 500 });
    }

    const fixtureMap = new Map((fixtures ?? []).map((f) => [f.id, f]));

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, predictions_public_before_lock, favourite_team")
      .eq("id", id)
      .maybeSingle();
    const display_name = profile?.display_name ?? null;
    const favourite_team = profile?.favourite_team ?? null;
    const predictionsPublicBeforeLock = profile?.predictions_public_before_lock === true;

    const { data: gwRow } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", "2025/26")
      .lt("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    let current_gameweek: number | null = null;
    if (gwRow?.gameweek != null && Number.isInteger(gwRow.gameweek)) {
      current_gameweek = gwRow.gameweek;
    }

    type Row = {
      prediction_id: string;
      fixture_id: string;
      pred_home_goals: number | null;
      pred_away_goals: number | null;
      pick: string | null;
      points_awarded: number;
      bonus_exact_score_points: number;
      settled_at: string | null;
      prediction_hidden: boolean;
      fixture: {
        home_team: string;
        away_team: string;
        kickoff_time: string;
        gameweek: number;
        status: string;
        home_goals: number | null;
        away_goals: number | null;
      } | null;
    };

    const buildRow = (p: (typeof predictions)[0]): Row | null => {
      const f = fixtureMap.get(p.fixture_id);
      if (!f) return null;
      const reveal = canRevealPredictionToViewer({
        isOwner,
        predictionsPublicBeforeLock,
        kickoffTimeIso: f.kickoff_time,
        oddsLockedAt: f.odds_locked_at ?? null,
        now,
      });
      const prediction_hidden = !reveal;
      return {
        prediction_id: p.id,
        fixture_id: p.fixture_id,
        pred_home_goals: reveal ? p.pred_home_goals : null,
        pred_away_goals: reveal ? p.pred_away_goals : null,
        pick: reveal ? p.pick : null,
        points_awarded: p.points_awarded ?? 0,
        bonus_exact_score_points: p.bonus_exact_score_points ?? 0,
        settled_at: p.settled_at,
        prediction_hidden,
        fixture: {
          home_team: f.home_team,
          away_team: f.away_team,
          kickoff_time: f.kickoff_time,
          gameweek: f.gameweek,
          status: f.status,
          home_goals: f.home_goals,
          away_goals: f.away_goals,
        },
      };
    };

    const pastKickoff = (fixtureId: string) => {
      const f = fixtureMap.get(fixtureId);
      return f ? new Date(f.kickoff_time) <= now : false;
    };

    const total_points = (predictions ?? []).reduce((sum, p) => {
      if (!pastKickoff(p.fixture_id)) return sum;
      return sum + (p.points_awarded ?? 0) + (p.bonus_exact_score_points ?? 0);
    }, 0);

    let list: Row[] = (predictions ?? []).map(buildRow).filter((r): r is Row => r != null);

    if (gameweek != null) {
      list = list.filter((r) => r.fixture?.gameweek === gameweek);
    }

    const gameweek_points = list.reduce((sum, r) => {
      if (!pastKickoff(r.fixture_id)) return sum;
      return sum + r.points_awarded + r.bonus_exact_score_points;
    }, 0);

    list.sort((a, b) => {
      const tA = a.fixture?.kickoff_time ?? "";
      const tB = b.fixture?.kickoff_time ?? "";
      return tB.localeCompare(tA);
    });

    return NextResponse.json({
      predictions: list,
      display_name,
      favourite_team,
      total_points,
      gameweek_points,
      current_gameweek,
      gameweek: gameweek ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
