import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { syncResultsFromFootballData } from "@/lib/sync-results";

/**
 * Syncs scores from Football-Data.org into our fixtures.
 */
export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const token = process.env.FOOTBALL_DATA_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!token) return NextResponse.json({ error: "Missing FOOTBALL_DATA_API_KEY" }, { status: 500 });
    if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateFrom = searchParams.get("dateFrom") ?? threeDaysAgo;
    const dateTo = searchParams.get("dateTo") ?? tomorrow;

    // Calls shared sync logic 
    const result = await syncResultsFromFootballData({
      dateFrom,
      dateTo,
      supabaseUrl,
      serviceKey,
      footballDataToken: token,
    });

    return NextResponse.json({
      success: true,
      dateFrom,
      dateTo,
      ...result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
