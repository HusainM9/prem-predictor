import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


export async function GET() {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", "2025/26")
      .lt("kickoff_time", nowIso)
      .order("kickoff_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const gameweek = row?.gameweek != null && Number.isInteger(row.gameweek) ? row.gameweek : null;
    return NextResponse.json({ gameweek });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
