import { NextResponse } from "next/server";

export async function GET() {
  try {
    const key = process.env.API_SPORTS_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing API_SPORTS_KEY" }, { status: 500 });
    }

    const url = "https://v3.football.api-sports.io/status";

    const res = await fetch(url, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "api-sports request failed", status: res.status, body: text },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(text));
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server route crashed", message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

