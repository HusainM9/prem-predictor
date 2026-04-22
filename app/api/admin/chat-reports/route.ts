import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

type ReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

function isReportStatus(value: string): value is ReportStatus {
  return value === "open" || value === "reviewed" || value === "resolved" || value === "dismissed";
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey);
}

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") ?? "all").trim();
    const scopeParam = (searchParams.get("scope") ?? "all").trim();
    const limitRaw = Number(searchParams.get("limit") ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 200;

    const supabase = createServiceClient();

    let query = supabase
      .from("chat_message_reports")
      .select(
        "id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusParam !== "all" && isReportStatus(statusParam)) {
      query = query.eq("status", statusParam);
    }
    if (scopeParam === "general") {
      query = query.eq("scope", "general");
    } else if (scopeParam === "league") {
      query = query.eq("scope", "league");
    }

    const { data: reports, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const leagueIds = [...new Set((reports ?? []).map((r) => r.league_id).filter((x): x is string => !!x))];
    let leagueById = new Map<string, { name: string | null }>();
    if (leagueIds.length > 0) {
      const { data: leagues } = await supabase.from("leagues").select("id,name").in("id", leagueIds);
      leagueById = new Map(
        (leagues ?? []).map((l) => [l.id as string, { name: (l.name as string | null) ?? null }])
      );
    }

    return NextResponse.json({
      reports: (reports ?? []).map((r) => ({
        ...r,
        league_name: r.league_id ? (leagueById.get(r.league_id)?.name ?? null) : null,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";

    if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
    if (!isReportStatus(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("chat_message_reports")
      .update({ status })
      .eq("id", reportId)
      .select(
        "id,message_id,reporter_user_id,reported_user_id,league_id,scope,reason,message_snapshot,status,created_at"
      )
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json({ report: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
