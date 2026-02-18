import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateInviteCode } from "@/lib/leagues";
import { validateLeagueName } from "@/lib/name-validation";

/**
 *Create a private league with a 6-char invite code, caller becomes owner.
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
    const rawName = typeof body.name === "string" ? body.name : "";
    const name = rawName.trim();
    const validation = validateLeagueName(name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: existing } = await supabase
        .from("leagues")
        .select("id")
        .eq("invite_code", inviteCode)
        .maybeSingle();
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .insert({
        name,
        invite_code: inviteCode,
        owner_id: user.id,
      })
      .select("id, name, invite_code")
      .single();

    if (leagueErr) {
      return NextResponse.json({ error: leagueErr.message }, { status: 500 });
    }

    const { error: memberErr } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberErr) {
      return NextResponse.json({ error: "League created but failed to add owner: " + memberErr.message }, { status: 500 });
    }

    return NextResponse.json({
      id: league.id,
      name: league.name,
      invite_code: league.invite_code,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
