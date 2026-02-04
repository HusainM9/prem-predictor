import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const region = process.env.ODDS_API_REGION || "uk";
    if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });

    // EPL = soccer_epl, market h2h = 1X2, oddsFormat decimal
    const url =
      `https://api.the-odds-api.com/v4/sports/soccer_epl/odds` +
      `?regions=${region}&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Odds API request failed", status: res.status, body: text },
        { status: 500 }
      );
    }

    const json = JSON.parse(text);

    // Return just a small sample so the browser doesn't choke
    return NextResponse.json({
      ok: true,
      events_returned: Array.isArray(json) ? json.length : 0,
      sample: Array.isArray(json) ? json.slice(0, 1) : json,
      note: "If events_returned is 0, try ODDS_API_REGION=eu or remove bookmaker preference later.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: String(err?.message ?? err) }, { status: 500 });
  }
}
