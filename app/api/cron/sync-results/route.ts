import { NextResponse } from "next/server";
import { syncResultsFromFootballData } from "@/lib/sync-results";

/**
 * GET: sync fixture results from Football-Data.org. Protected by CRON_SECRET.
 * Call from cron every 15–60 min so /matches shows live scores.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(req.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (bearer !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY is not set" }, { status: 500 });
  }
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }

  // --- Sync window: 3 days ago through tomorrow ---
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    // --- Fetches Football-Data.org PL matches and updates fixtures ---
    const result = await syncResultsFromFootballData({
      dateFrom: threeDaysAgo,
      dateTo: tomorrow,
      supabaseUrl,
      serviceKey,
      footballDataToken: token,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
