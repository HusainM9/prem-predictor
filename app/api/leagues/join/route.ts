import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidInviteCodeFormat } from "@/lib/leagues";

/**
 * Join a league by invite code.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length !== 6 || !isValidInviteCodeFormat(code)) {
      return NextResponse.json({ error: "Please enter the 6-character invite code" }, { status: 400 });
    }

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    if (leagueErr || !league) {
      return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", league.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ message: "Already in this league", leagueId: league.id, name: league.name });
    }

    const { error: insertErr } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "member",
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Joined league",
      leagueId: league.id,
      name: league.name,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
