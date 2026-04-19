import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateDisplayName } from "@/lib/name-validation";
import { isValidFavouriteTeam } from "@/lib/premier-league-teams";

export async function GET(req: Request) {
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

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, display_name_changed_at, predictions_public_before_lock, favourite_team")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const DISPLAY_NAME_COOLDOWN_DAYS = 60;
    const changedAt = profile?.display_name_changed_at ? new Date(profile.display_name_changed_at) : null;
    const nextChangeAt = changedAt
      ? new Date(changedAt.getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
      : null;
    const canChangeDisplayName = !nextChangeAt || new Date() >= nextChangeAt;

    return NextResponse.json({
      display_name: profile?.display_name ?? null,
      display_name_changed_at: profile?.display_name_changed_at ?? null,
      next_display_name_change_at: nextChangeAt?.toISOString() ?? null,
      can_change_display_name: canChangeDisplayName,
      predictions_public_before_lock: profile?.predictions_public_before_lock === true,
      favourite_team: profile?.favourite_team ?? null,
      email: user.email ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

const DISPLAY_NAME_COOLDOWN_DAYS = 60;


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

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();
    const updatePayload: {
      id: string;
      updated_at: string;
      display_name?: string;
      display_name_changed_at?: string;
      predictions_public_before_lock?: boolean;
      favourite_team?: string | null;
    } = {
      id: user.id,
      updated_at: now,
    };
    let touched = false;
    let nextDisplayNameChangeAt: string | null = null;

    if (typeof body.predictions_public_before_lock === "boolean") {
      updatePayload.predictions_public_before_lock = body.predictions_public_before_lock;
      touched = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "favourite_team")) {
      const raw = body.favourite_team;
      if (raw == null || raw === "") {
        updatePayload.favourite_team = null;
      } else if (typeof raw === "string" && isValidFavouriteTeam(raw.trim())) {
        updatePayload.favourite_team = raw.trim();
      } else {
        return NextResponse.json(
          { error: "Invalid favourite_team. Select a valid Premier League team." },
          { status: 400 }
        );
      }
      touched = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "display_name")) {
      if (typeof body.display_name !== "string") {
        return NextResponse.json({ error: "display_name must be a string" }, { status: 400 });
      }
      const trimmed = body.display_name.trim();
      if (trimmed.length === 0) {
        return NextResponse.json({ error: "display_name is required and must be non-empty" }, { status: 400 });
      }
      const validation = validateDisplayName(trimmed);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Enforce unique display names (case-insensitive) across users.
      const { data: existingName, error: existingNameErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("display_name", trimmed)
        .neq("id", user.id)
        .limit(1)
        .maybeSingle();
      if (existingNameErr) {
        return NextResponse.json({ error: existingNameErr.message }, { status: 500 });
      }
      if (existingName) {
        return NextResponse.json(
          { error: "This display name is already taken. Please choose another." },
          { status: 409 }
        );
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name_changed_at")
        .eq("id", user.id)
        .maybeSingle();

      const changedAt = profile?.display_name_changed_at ? new Date(profile.display_name_changed_at) : null;
      const nextAllowed = changedAt
        ? new Date(changedAt.getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
        : null;
      if (nextAllowed && new Date() < nextAllowed) {
        return NextResponse.json(
          {
            error: `You can change your display name again after ${nextAllowed.toISOString().slice(0, 10)} (once every ${DISPLAY_NAME_COOLDOWN_DAYS} days).`,
            next_display_name_change_at: nextAllowed.toISOString(),
          },
          { status: 429 }
        );
      }

      updatePayload.display_name = trimmed;
      updatePayload.display_name_changed_at = now;
      touched = true;
      nextDisplayNameChangeAt = new Date(
        Date.now() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    if (!touched) {
      return NextResponse.json(
        { error: "No profile fields to update." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(updatePayload, { onConflict: "id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      display_name: updatePayload.display_name ?? null,
      favourite_team:
        Object.prototype.hasOwnProperty.call(updatePayload, "favourite_team")
          ? updatePayload.favourite_team
          : null,
      predictions_public_before_lock:
        typeof updatePayload.predictions_public_before_lock === "boolean"
          ? updatePayload.predictions_public_before_lock
          : null,
      next_display_name_change_at: nextDisplayNameChangeAt,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
