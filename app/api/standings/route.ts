import { NextResponse } from "next/server";
import { getClientId, isRateLimited } from "@/lib/rate-limit";
import { getStandings, STANDINGS_REVALIDATE_SEC } from "@/lib/standings";

const CACHE_CONTROL = `public, max-age=${STANDINGS_REVALIDATE_SEC}, s-maxage=${STANDINGS_REVALIDATE_SEC}, stale-while-revalidate=300`;

/** Premier League standings hourly snapshot. */
export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const result = await getStandings();
  if (result.error) {
    return NextResponse.json(
      { error: result.error, status: result.status },
      {
        status: result.status === 429 ? 429 : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
