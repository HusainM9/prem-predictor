import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canModerateLeagueChat, type LeagueMemberRole } from "@/lib/chat/permissions";

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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: reports, error } = await supabase
      .from("chat_message_reports")
      .select(
        "id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at"
      )
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ reports: reports ?? [] });
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
    const scope = parseScope(typeof body.scope === "string" ? body.scope : null);
    const leagueIdRaw = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
    const leagueId = scope === "league" ? leagueIdRaw : null;
    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!messageId) return NextResponse.json({ error: "Missing messageId" }, { status: 400 });
    if (reasonRaw.length > 250) {
      return NextResponse.json({ error: "Reason is too long" }, { status: 400 });
    }
    if (scope === "league" && !leagueId) {
      return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
    }

    const { supabase } = await getClients();
    if (scope === "league" && leagueId) {
      const role = await getLeagueMemberRole(supabase, leagueId, viewer.id);
      if (!role) {
        return NextResponse.json({ error: "You must be in this league to report messages." }, { status: 403 });
      }
    }

    const { data: message } = await supabase
      .from("messages")
      .select("id,user_id,league_id,message_type,text,prediction_payload,created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (scope === "general" && message.league_id != null) {
      return NextResponse.json({ error: "Message is not in global chat." }, { status: 400 });
    }
    if (scope === "league" && message.league_id !== leagueId) {
      return NextResponse.json({ error: "Message is not in this league chat." }, { status: 400 });
    }
    if (message.user_id === viewer.id) {
      return NextResponse.json({ error: "You cannot report your own message." }, { status: 400 });
    }

    const { data: reportedProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", message.user_id as string)
      .maybeSingle();
    const { data: reporterProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", viewer.id)
      .maybeSingle();

    const messageSnapshot = {
      message_id: message.id,
      message_type: message.message_type,
      message_text: message.text,
      prediction_payload: message.prediction_payload,
      message_created_at: message.created_at,
      sender_user_id: message.user_id,
      sender_display_name:
        typeof reportedProfile?.display_name === "string" && reportedProfile.display_name.trim().length > 0
          ? reportedProfile.display_name.trim()
          : "Player",
      reporter_user_id: viewer.id,
      reporter_display_name:
        typeof reporterProfile?.display_name === "string" && reporterProfile.display_name.trim().length > 0
          ? reporterProfile.display_name.trim()
          : "Player",
    };

    const { data: report, error } = await supabase
      .from("chat_message_reports")
      .upsert(
        {
          message_id: message.id,
          reporter_user_id: viewer.id,
          reported_user_id: message.user_id,
          league_id: scope === "league" ? leagueId : null,
          scope,
          reason: reasonRaw.length > 0 ? reasonRaw : null,
          message_snapshot: messageSnapshot,
          status: "open",
          created_at: new Date().toISOString(),
        },
        { onConflict: "message_id,reporter_user_id" }
      )
      .select("id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ report });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
