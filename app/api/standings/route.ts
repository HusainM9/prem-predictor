import { NextResponse } from "next/server";
import { getClientId, isRateLimited } from "@/lib/rate-limit";
import { getStandings, STANDINGS_REVALIDATE_SEC } from "@/lib/standings";

/** Cache-Control: 1-hour snapshot so browsers/CDN cache and reduce requests. */
const CACHE_CONTROL = `public, max-age=${STANDINGS_REVALIDATE_SEC}, s-maxage=${STANDINGS_REVALIDATE_SEC}, stale-while-revalidate=300`;

/**
 * GET: returns Premier League standings (hourly snapshot). Proxied so token stays server-side.
 * Response is cacheable for 1 hour so many users get it from cache without hitting the server.
 */
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
