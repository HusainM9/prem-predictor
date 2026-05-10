import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canDeleteLeagueChatMessages,
  canModerateLeagueChat,
  type LeagueMemberRole,
} from "@/lib/chat/permissions";

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

    const bannedUserIds = [...new Set((bans ?? []).map((b) => b.banned_user_id).filter(Boolean))];
    let profileByUser = new Map<string, { display_name: string | null }>();
    if (bannedUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", bannedUserIds);
      profileByUser = new Map(
        (profiles ?? []).map((p) => [p.id as string, { display_name: (p.display_name as string | null) ?? null }])
      );
    }

    return NextResponse.json({
      can_moderate: true,
      can_delete_messages: canDeleteLeagueChatMessages(role),
      bans: (bans ?? []).map((b) => ({
        ...b,
        banned_display_name: profileByUser.get(b.banned_user_id)?.display_name ?? null,
      })),
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

    const body = await req.json().catch(() => ({}));
    const leagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
    const bannedUserId = typeof body.bannedUserId === "string" ? body.bannedUserId.trim() : "";
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
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

    const reason = reasonRaw.length > 0 ? reasonRaw.slice(0, 250) : null;
    const nowIso = new Date().toISOString();

    const { data: existing, error: existingErr } = await supabase
      .from("chat_bans")
      .select("id")
      .eq("league_id", leagueId)
      .eq("banned_user_id", bannedUserId)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    const payload = {
      league_id: leagueId,
      banned_user_id: bannedUserId,
      created_by: viewer.id,
      reason,
      created_at: nowIso,
      expires_at: null as string | null,
    };

    const banQuery = existing?.id
      ? supabase
          .from("chat_bans")
          .update({
            created_by: viewer.id,
            reason,
            created_at: nowIso,
            expires_at: null,
          })
          .eq("id", existing.id)
          .select("id,banned_user_id,created_by,reason,created_at,expires_at")
          .single()
      : supabase.from("chat_bans").insert(payload).select("id,banned_user_id,created_by,reason,created_at,expires_at").single();

    const { data, error } = await banQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let report = null;
    if (reportId) {
      const { data: resolvedReport, error: reportError } = await supabase
        .from("chat_message_reports")
        .update({ status: "resolved" })
        .eq("id", reportId)
        .eq("league_id", leagueId)
        .select("id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at")
        .maybeSingle();
      if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
      report = resolvedReport;
    }

    return NextResponse.json({ ban: data, report });
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

