import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const supabase = createClient(supabaseUrl, serviceKey);

  const fromIso = "2026-02-06T00:00:00.000Z";
  const toIso = "2026-02-13T23:59:59.999Z";

  const { data, error } = await supabase
    .from("fixtures")
    .select("id,kickoff_time,home_team,away_team")
    .gte("kickoff_time", fromIso)
    .lte("kickoff_time", toIso)
    .order("kickoff_time", { ascending: true })
    .limit(5);

  return NextResponse.json({ ok: true, count: data?.length ?? 0, sample: data, error: error?.message ?? null });
}
