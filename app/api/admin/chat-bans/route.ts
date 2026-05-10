import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

type ReportScope = "general" | "league";

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey);
}

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    const resolveReport = body.resolveReport !== false;

    if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

    const supabase = createServiceClient();
    const { data: report, error: reportError } = await supabase
      .from("chat_message_reports")
      .select("id,reported_user_id,league_id,scope,reason,status")
      .eq("id", reportId)
      .maybeSingle();
    if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const scope = report.scope as ReportScope;
    const leagueId = scope === "league" ? ((report.league_id as string | null) ?? null) : null;
    const bannedUserId = typeof report.reported_user_id === "string" ? report.reported_user_id : "";
    if (!bannedUserId) return NextResponse.json({ error: "Report is missing reported user." }, { status: 400 });
    if (scope === "league" && !leagueId) {
      return NextResponse.json({ error: "League report is missing leagueId." }, { status: 400 });
    }

    const reason = (reasonRaw || (typeof report.reason === "string" ? report.reason : "") || "Banned from admin report").slice(
      0,
      250
    );

    let existingBanQuery = supabase
      .from("chat_bans")
      .select("id")
      .eq("banned_user_id", bannedUserId)
      .limit(1);
    existingBanQuery = leagueId
      ? existingBanQuery.eq("league_id", leagueId)
      : existingBanQuery.is("league_id", null);

    const { data: existingBans, error: existingError } = await existingBanQuery;
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const banPayload = {
      league_id: leagueId,
      banned_user_id: bannedUserId,
      reason,
      created_at: new Date().toISOString(),
      expires_at: null,
    };

    const existingBanId = existingBans?.[0]?.id as string | undefined;
    const banQuery = existingBanId
      ? supabase
          .from("chat_bans")
          .update(banPayload)
          .eq("id", existingBanId)
          .select("id,league_id,banned_user_id,reason,created_at,expires_at")
          .single()
      : supabase
          .from("chat_bans")
          .insert(banPayload)
          .select("id,league_id,banned_user_id,reason,created_at,expires_at")
          .single();

    const { data: ban, error: banError } = await banQuery;
    if (banError) return NextResponse.json({ error: banError.message }, { status: 500 });

    let updatedReport = report;
    if (resolveReport) {
      const { data: resolved, error: resolveError } = await supabase
        .from("chat_message_reports")
        .update({ status: "resolved" })
        .eq("id", reportId)
        .select("id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at")
        .maybeSingle();
      if (resolveError) return NextResponse.json({ error: resolveError.message }, { status: 500 });
      updatedReport = resolved ?? report;
    }

    return NextResponse.json({ ban, report: updatedReport });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
