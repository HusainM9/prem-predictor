import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getChatMessageRetentionMs } from "@/lib/chat/retention";

const BATCH = 200;

function unauthorizedUnlessCronOrAdmin(req: Request): NextResponse | null {
  const adminError = requireAdmin(req);
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(req.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  const adminOk = adminError === null;
  const cronOk = cronSecret && (bearer === cronSecret || querySecret === cronSecret);
  if (!adminOk && !cronOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runChatCleanup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const boundary = new Date(Date.now() - getChatMessageRetentionMs()).toISOString();

  let messagesDeleted = 0;

  try {
    for (;;) {
      const { data: stale, error: selErr } = await supabase
        .from("messages")
        .select("id")
        .lt("created_at", boundary)
        .limit(BATCH);

      if (selErr) {
        return NextResponse.json({ error: selErr.message }, { status: 500 });
      }
      if (!stale?.length) break;

      const ids = stale.map((r) => r.id as string);

      const { error: reErr } = await supabase
        .from("reactions")
        .delete()
        .eq("target_type", "chat_message")
        .in("target_id", ids);
      if (reErr) {
        return NextResponse.json({ error: reErr.message }, { status: 500 });
      }

      const { error: delErr } = await supabase.from("messages").delete().in("id", ids);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      messagesDeleted += ids.length;
    }

    return NextResponse.json({
      success: true,
      messages_deleted: messagesDeleted,
      retention_ms: getChatMessageRetentionMs(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * Vercel Cron invokes this path with **GET** (see `vercel.json`).
 * Use `CRON_SECRET` as `Authorization: Bearer …` or `?secret=…`.
 */
export async function GET(req: Request) {
  const denied = unauthorizedUnlessCronOrAdmin(req);
  if (denied) return denied;
  return runChatCleanup();
}

/**
 * Same as GET; optional for manual triggers or non-Vercel schedulers.
 */
export async function POST(req: Request) {
  const denied = unauthorizedUnlessCronOrAdmin(req);
  if (denied) return denied;
  return runChatCleanup();
}
