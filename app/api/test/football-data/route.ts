import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "Missing FOOTBALL_DATA_API_KEY" }, { status: 500 });
  }

  const url = "https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED";

  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  const text = await res.text();

  if (!res.ok) {
    return NextResponse.json(
      { error: "football-data.org request failed", status: res.status, body: text },
      { status: 500 }
    );
  }

  return NextResponse.json(JSON.parse(text));
}
