import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canModerateLeagueChat, type LeagueMemberRole } from "@/lib/chat/permissions";

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

async function getLeagueMemberRole(
  supabase: ServiceSupabaseClient,
  leagueId: string,
  userId: string
): Promise<LeagueMemberRole> {
  const { data } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || typeof data.role !== "string") return null;
  if (data.role === "owner" || data.role === "admin" || data.role === "member") return data.role;
  return null;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewer = await getViewer(token);
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get("leagueId")?.trim() ?? "";
    if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });

    const { supabase } = await getClients();
    const role = await getLeagueMemberRole(supabase, leagueId, viewer.id);
    if (!canModerateLeagueChat(role)) {
      return NextResponse.json({ can_moderate: false, bans: [] });
    }

    const { data: bans, error } = await supabase
      .from("chat_bans")
      .select("id,banned_user_id,created_by,reason,created_at,expires_at")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ can_moderate: true, bans: bans ?? [] });
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

    const body = await req.json().catch(() => ({}));
    const leagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
    const bannedUserId = typeof body.bannedUserId === "string" ? body.bannedUserId.trim() : "";
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!leagueId || !bannedUserId) {
      return NextResponse.json({ error: "leagueId and bannedUserId are required" }, { status: 400 });
    }
    if (viewer.id === bannedUserId) {
      return NextResponse.json({ error: "You cannot ban yourself." }, { status: 400 });
    }

    const { supabase } = await getClients();
    const role = await getLeagueMemberRole(supabase, leagueId, viewer.id);
    if (!canModerateLeagueChat(role)) {
      return NextResponse.json({ error: "Only league admins can ban users." }, { status: 403 });
    }

    const { data: targetMember } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId)
      .eq("user_id", bannedUserId)
      .maybeSingle();
    if (!targetMember) {
      return NextResponse.json({ error: "User is not in this league." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("chat_bans")
      .upsert(
        {
          league_id: leagueId,
          banned_user_id: bannedUserId,
          created_by: viewer.id,
          reason: reasonRaw.length > 0 ? reasonRaw.slice(0, 250) : null,
          created_at: new Date().toISOString(),
          expires_at: null,
        },
        {
          onConflict: "league_id,banned_user_id",
        }
      )
      .select("id,banned_user_id,created_by,reason,created_at,expires_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ban: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewer = await getViewer(token);
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const leagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
    const bannedUserId = typeof body.bannedUserId === "string" ? body.bannedUserId.trim() : "";
    if (!leagueId || !bannedUserId) {
      return NextResponse.json({ error: "leagueId and bannedUserId are required" }, { status: 400 });
    }

    const { supabase } = await getClients();
    const role = await getLeagueMemberRole(supabase, leagueId, viewer.id);
    if (!canModerateLeagueChat(role)) {
      return NextResponse.json({ error: "Only league admins can unban users." }, { status: 403 });
    }

    const { error } = await supabase
      .from("chat_bans")
      .delete()
      .eq("league_id", leagueId)
      .eq("banned_user_id", bannedUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

