import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { STANDINGS_CACHE_TAG } from "@/lib/standings";

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    revalidateTag(STANDINGS_CACHE_TAG, "max");
    revalidatePath("/table", "page");
    return NextResponse.json({
      success: true,
      message: "Standings cache cleared. Next load of the table page will fetch fresh data.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Revalidation failed" },
      { status: 500 }
    );
  }
}
