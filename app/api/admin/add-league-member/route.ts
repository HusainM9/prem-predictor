import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

/**
 * Adds the user with that email to the league as a member (if not already).
 */

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const leagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
    if (!email || !leagueId) {
      return NextResponse.json(
        { error: "email and leagueId are required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .select("id, name")
      .eq("id", leagueId)
      .maybeSingle();
    if (leagueErr || !league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) {
      return NextResponse.json({ error: "Failed to list users: " + listErr.message }, { status: 500 });
    }
    const user = (listData?.users ?? []).find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      return NextResponse.json({ error: "No user found with that email" }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        message: "User is already in this league",
        leagueId: league.id,
        leagueName: league.name,
        email,
      });
    }

    const { error: insertErr } = await supabase.from("league_members").insert({
      league_id: leagueId,
      user_id: user.id,
      role: "member",
    });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Added user to league",
      leagueId: league.id,
      leagueName: league.name,
      email,
      userId: user.id,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
