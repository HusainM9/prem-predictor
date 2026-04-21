import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPredictionSharePayload, type ShareablePredictionRow } from "@/lib/chat/prediction-share";
import { validateChatText } from "@/lib/chat/moderation";
import { getChatMessageRetentionMs, getChatMessagesNotBeforeIso } from "@/lib/chat/retention";

type Scope = "general" | "league";

function parseScope(value: string | null): Scope {
  return value === "league" ? "league" : "general";
}

async function getClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return {
    supabaseAuth: createClient(supabaseUrl, anonKey),
    supabase: createClient(supabaseUrl, serviceKey),
  };
}

type ServiceSupabaseClient = Awaited<ReturnType<typeof getClients>>["supabase"];

async function getViewer(token: string | null) {
  if (!token) return null;
  const { supabaseAuth } = await getClients();
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function isLeagueMember(
  supabase: ServiceSupabaseClient,
  leagueId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function isUserBannedInScope(
  supabase: ServiceSupabaseClient,
  userId: string,
  scope: Scope,
  leagueId: string | null
): Promise<boolean> {
  let query = supabase
    .from("chat_bans")
    .select("id,expires_at")
    .eq("banned_user_id", userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);

  if (scope === "general") {
    query = query.is("league_id", null);
  } else {
    query = query.eq("league_id", leagueId);
  }

  const { data } = await query.maybeSingle();
  return !!data;
}

async function getShareablePrediction(
  supabase: ServiceSupabaseClient,
  predictionId: string,
  userId: string
): Promise<ShareablePredictionRow | null> {
  const { data, error } = await supabase
    .from("predictions")
    .select(
      "id,fixture_id,pred_home_goals,pred_away_goals,pick,submitted_at,points_awarded,bonus_exact_score_points,bonus_points,settled_at,fixtures!inner(home_team,away_team,kickoff_time,gameweek,status,home_goals,away_goals)"
    )
    .eq("id", predictionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const fixtureRow = Array.isArray(data.fixtures) ? data.fixtures[0] : data.fixtures;
  if (!fixtureRow) return null;
  return {
    id: data.id as string,
    fixture_id: data.fixture_id as string,
    pred_home_goals: Number(data.pred_home_goals),
    pred_away_goals: Number(data.pred_away_goals),
    pick: data.pick as "H" | "D" | "A",
    submitted_at: data.submitted_at as string,
    points_awarded: Number(data.points_awarded ?? 0),
    bonus_points: Number(data.bonus_exact_score_points ?? data.bonus_points ?? 0),
    total_points: Number(data.points_awarded ?? 0) + Number(data.bonus_exact_score_points ?? data.bonus_points ?? 0),
    settled_at: (data.settled_at as string | null) ?? null,
    fixture: {
      home_team: fixtureRow.home_team as string,
      away_team: fixtureRow.away_team as string,
      kickoff_time: fixtureRow.kickoff_time as string,
      gameweek: Number(fixtureRow.gameweek ?? 0),
      status: (fixtureRow.status as string | null) ?? null,
      home_goals: (fixtureRow.home_goals as number | null) ?? null,
      away_goals: (fixtureRow.away_goals as number | null) ?? null,
    },
  };
}

function normalizeMessageRows(
  rows: Array<{
    id: string;
    user_id: string;
    league_id: string | null;
    message_type: string;
    text: string | null;
    prediction_payload: unknown;
    created_at: string;
  }>,
  profileByUser: Map<string, { display_name: string; favourite_team: string | null }>
) {
  return rows.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    league_id: m.league_id,
    message_type: m.message_type,
    text: m.text,
    prediction_payload: m.prediction_payload,
    created_at: m.created_at,
    sender_display_name: profileByUser.get(m.user_id)?.display_name ?? "Player",
    sender_favourite_team: profileByUser.get(m.user_id)?.favourite_team ?? null,
  }));
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewer = await getViewer(token);
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { supabase } = await getClients();
    const { searchParams } = new URL(req.url);
    const scope = parseScope(searchParams.get("scope"));
    const leagueId = searchParams.get("leagueId")?.trim() ?? null;
    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 50;

    if (scope === "league") {
      if (!leagueId) {
        return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
      }
      const member = await isLeagueMember(supabase, leagueId, viewer.id);
      if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const notBeforeIso = getChatMessagesNotBeforeIso();

    let query = supabase
      .from("messages")
      .select("id,user_id,league_id,message_type,text,prediction_payload,created_at")
      .gte("created_at", notBeforeIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope === "general") query = query.is("league_id", null);
    else query = query.eq("league_id", leagueId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<{
      id: string;
      user_id: string;
      league_id: string | null;
      message_type: string;
      text: string | null;
      prediction_payload: unknown;
      created_at: string;
    }>;
    const ordered = [...rows].reverse();
    const userIds = [...new Set(ordered.map((m) => m.user_id))];
    let profileByUser = new Map<string, { display_name: string; favourite_team: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,display_name,favourite_team")
        .in("id", userIds);
      profileByUser = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          {
            display_name: (p.display_name as string | null) ?? "Player",
            favourite_team: (p.favourite_team as string | null) ?? null,
          },
        ])
      );
    }

    return NextResponse.json({
      messages: normalizeMessageRows(ordered, profileByUser),
      retention: { maxAgeMs: getChatMessageRetentionMs() },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewer = await getViewer(token);
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { supabase } = await getClients();
    const body = await req.json().catch(() => ({}));
    const scope = parseScope(typeof body.scope === "string" ? body.scope : null);
    const leagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : null;
    const messageType =
      typeof body.messageType === "string" && body.messageType === "prediction_share"
        ? "prediction_share"
        : "text";
    const rawText = typeof body.text === "string" ? body.text : "";
    const predictionId =
      typeof body.predictionId === "string" && body.predictionId.trim().length > 0
        ? body.predictionId.trim()
        : null;

    if (scope === "league") {
      if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
      const member = await isLeagueMember(supabase, leagueId, viewer.id);
      if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const blocked = await isUserBannedInScope(supabase, viewer.id, scope, leagueId);
    if (blocked) {
      return NextResponse.json(
        { error: "You are banned from sending messages in this chat." },
        { status: 403 }
      );
    }

    const textValidation = validateChatText(rawText, {
      required: messageType === "text",
      maxLength: 1000,
    });
    if (!textValidation.ok) {
      return NextResponse.json({ error: textValidation.error }, { status: 400 });
    }

    let predictionPayload: ReturnType<typeof buildPredictionSharePayload> | null = null;
    if (messageType === "prediction_share") {
      if (!predictionId) {
        return NextResponse.json({ error: "Missing predictionId" }, { status: 400 });
      }
      const prediction = await getShareablePrediction(supabase, predictionId, viewer.id);
      if (!prediction) {
        return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
      }
      predictionPayload = buildPredictionSharePayload(prediction);
    }

    const insertPayload = {
      user_id: viewer.id,
      league_id: scope === "league" ? leagueId : null,
      message_type: messageType,
      text: messageType === "text" ? textValidation.value : textValidation.value || null,
      prediction_payload: predictionPayload,
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(insertPayload)
      .select("id,user_id,league_id,message_type,text,prediction_payload,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name,favourite_team")
      .eq("id", viewer.id)
      .maybeSingle();

    return NextResponse.json({
      message: {
        ...data,
        sender_display_name: profile?.display_name ?? "Player",
        sender_favourite_team: profile?.favourite_team ?? null,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

