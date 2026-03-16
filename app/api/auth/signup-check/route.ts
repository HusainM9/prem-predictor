import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!email || !displayName) {
      return NextResponse.json({ error: "Missing email or displayName" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const [profileRes, usersRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id")
        .ilike("display_name", displayName)
        .limit(1),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const displayNameTaken = !!profileRes.data?.length;
    const emailExists = (usersRes.data?.users ?? []).some(
      (u) => (u.email ?? "").toLowerCase() === email
    );

    return NextResponse.json({
      emailExists,
      displayNameTaken,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

