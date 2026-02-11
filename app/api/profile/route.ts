import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * PATCH: update current user's display_name. Requires Authorization: Bearer <access_token>.
 */
export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : null;
    if (display_name === null || display_name.length === 0) {
      return NextResponse.json({ error: "display_name is required and must be non-empty" }, { status: 400 });
    }
    if (display_name.length > 64) {
      return NextResponse.json({ error: "display_name must be at most 64 characters" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, display_name });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
