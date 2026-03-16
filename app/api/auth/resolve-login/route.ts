import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Resolve a login identifier to an email.
 * - If identifier already looks like an email, returns it unchanged.
 * - Otherwise tries case-insensitive display_name lookup in profiles, then maps user id -> auth email.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    if (!rawIdentifier) {
      return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
    }

    if (rawIdentifier.includes("@")) {
      return NextResponse.json({ email: rawIdentifier.toLowerCase() });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: matches, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .ilike("display_name", rawIdentifier)
      .limit(2);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // No unique match means caller should fall back to normal email login behavior.
    if (!matches || matches.length !== 1) {
      return NextResponse.json({ email: null });
    }

    const uid = matches[0].id as string;
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(uid);
    if (userErr || !userData?.user?.email) {
      return NextResponse.json({ email: null });
    }

    return NextResponse.json({ email: userData.user.email });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

