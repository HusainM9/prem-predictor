import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.API_SPORTS_KEY;
  if (!key) return NextResponse.json({ error: "Missing API_SPORTS_KEY" }, { status: 500 });

  // Test date window that should definitely contain games (your DB has Jan 31 fixtures)
  const from = "2026-01-30";
  const to = "2026-02-02";

  // Try common EPL league id 39, try multiple seasons
  const candidates = [
    { league: 39, season: 2025 },
    { league: 39, season: 2026 },
  ];

  const results: any[] = [];

  for (const c of candidates) {
    const url = `https://v3.football.api-sports.io/fixtures?league=${c.league}&season=${c.season}&from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    results.push({
      url,
      status: res.status,
      errors: json?.errors,
      results: json?.results,
      sample: (json?.response ?? []).slice(0, 2),
    });
  }

  return NextResponse.json({ ok: true, results });
}
