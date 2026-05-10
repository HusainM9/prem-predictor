import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Lightweight leagues list for dashboard:
 * - ensures user is in global league
 * - returns only ordered league id + name
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const globalLeagueId = process.env.GLOBAL_LEAGUE_ID ?? process.env.NEXT_PUBLIC_GLOBAL_LEAGUE_ID ?? null;
    if (globalLeagueId) {
      const { data: existingGlobal } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", globalLeagueId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existingGlobal) {
        await supabase.from("league_members").insert({
          league_id: globalLeagueId,
          user_id: user.id,
          role: "member",
        });
      }
    }

    const { data: members, error: memErr } = await supabase
      .from("league_members")
      .select("league_id, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const leagueIds = (members ?? []).map((m) => m.league_id);
    if (leagueIds.length === 0) {
      return NextResponse.json({ leagues: [] });
    }

    const { data: leagues, error: leagueErr } = await supabase
      .from("leagues")
      .select("id, name")
      .in("id", leagueIds);
    if (leagueErr) {
      return NextResponse.json({ error: leagueErr.message }, { status: 500 });
    }

    const byId = new Map((leagues ?? []).map((l) => [l.id, l]));
    const ordered = leagueIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((l) => ({ id: l!.id as string, name: l!.name as string }));

    return NextResponse.json({ leagues: ordered });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

