import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientId, isRateLimited } from "@/lib/rate-limit";
import {
  createEmptyReactionSummary,
  isValidReactionEmojiInput,
  isValidReactionTargetType,
  type ReactionSummary,
  type ReactionTargetType,
} from "@/lib/reactions";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function parseTargetIds(param: string | null): string[] {
  if (!param) return [];
  return [...new Set(param.split(",").map((x) => x.trim()).filter((x) => x.length > 0 && isUuid(x)))];
}

async function getClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return {
    supabaseAuth: createClient(supabaseUrl, anonKey),
    supabase: createClient(supabaseUrl, serviceKey),
  };
}

async function getViewerIdFromToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const { supabaseAuth } = await getClients();
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

function buildSummaryMap(
  rows: Array<{ target_id: string; emoji: string; user_id: string }>,
  targetIds: string[],
  viewerId: string | null
): Record<string, ReactionSummary> {
  const byTarget: Record<string, ReactionSummary> = {};
  for (const targetId of targetIds) {
    byTarget[targetId] = createEmptyReactionSummary();
  }
  for (const row of rows) {
    const summary = byTarget[row.target_id];
    if (!summary) continue;
    const emoji = row.emoji;
    summary.counts[emoji] = (summary.counts[emoji] ?? 0) + 1;
    summary.total += 1;
    if (viewerId && row.user_id === viewerId) {
      summary.myEmoji = emoji;
    }
  }
  return byTarget;
}

export async function GET(req: Request) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 120, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetType = (searchParams.get("targetType") ?? "").trim();
    if (!isValidReactionTargetType(targetType)) {
      return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
    }
    const targetIds = parseTargetIds(searchParams.get("targetIds"));
    if (targetIds.length === 0) {
      return NextResponse.json({ targets: {} });
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewerId = await getViewerIdFromToken(token);

    const { supabase } = await getClients();
    const { data, error } = await supabase
      .from("reactions")
      .select("target_id, emoji, user_id")
      .eq("target_type", targetType)
      .in("target_id", targetIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      targets: buildSummaryMap(
        (data ?? []) as Array<{ target_id: string; emoji: string; user_id: string }>,
        targetIds,
        viewerId
      ),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const clientId = getClientId(req);
    if (isRateLimited(clientId, 60, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const viewerId = await getViewerIdFromToken(token);
    if (!viewerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";
    const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

    if (!isValidReactionTargetType(targetType)) {
      return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
    }
    if (!isUuid(targetId)) {
      return NextResponse.json({ error: "Invalid targetId" }, { status: 400 });
    }
    if (!isValidReactionEmojiInput(emoji)) {
      return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
    }

    const { supabase } = await getClients();

    if (targetType === "prediction") {
      const { data: prediction } = await supabase
        .from("predictions")
        .select("user_id")
        .eq("id", targetId)
        .maybeSingle();
      if (!prediction) {
        return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
      }
      if (prediction.user_id === viewerId) {
        return NextResponse.json(
          { error: "You cannot react to your own prediction." },
          { status: 400 }
        );
      }
    }

    if (targetType === "match") {
      const { data: fixture } = await supabase
        .from("fixtures")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();
      if (!fixture) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
    }

    if (targetType === "chat_message") {
      const { data: message } = await supabase
        .from("messages")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();
      if (!message) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
    }

    const { data: existing, error: existingErr } = await supabase
      .from("reactions")
      .select("id, emoji")
      .eq("user_id", viewerId)
      .eq("target_type", targetType as ReactionTargetType)
      .eq("target_id", targetId)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    if (existing) {
      if (existing.emoji === emoji) {
        const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await supabase
          .from("reactions")
          .update({ emoji, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase.from("reactions").insert({
        user_id: viewerId,
        target_type: targetType,
        target_id: targetId,
        emoji,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: rows, error } = await supabase
      .from("reactions")
      .select("target_id, emoji, user_id")
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const targets = buildSummaryMap(
      (rows ?? []) as Array<{ target_id: string; emoji: string; user_id: string }>,
      [targetId],
      viewerId
    );
    return NextResponse.json({ target: targets[targetId] ?? createEmptyReactionSummary() });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

