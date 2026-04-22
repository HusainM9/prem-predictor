"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/avatar/UserAvatar";
import { ReactionBar } from "@/components/reactions/ReactionBar";
import { supabase } from "@/lib/supabase/client";
import {
  useChatMessages,
  type ChatScope,
  type ShareablePrediction,
  type ChatMessage,
} from "@/hooks/useChatMessages";
import { useReactions } from "@/hooks/useReactions";

type ChatPanelProps = {
  scope: ChatScope;
  leagueId?: string | null;
  title: string;
  className?: string;
  messageListClassName?: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatScore(home: number | null, away: number | null): string {
  if (home == null || away == null) return "Pending";
  return `${home}-${away}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type MessageReplyMeta = {
  reply_to_message_id: string;
  reply_to_sender_display_name: string;
  reply_to_text: string;
};

type ChatMessageReport = {
  id: string;
  message_id: string;
  reason: string | null;
  status: string | null;
  created_at: string;
  message_snapshot: {
    message_text: string | null;
    sender_display_name: string | null;
    reporter_display_name: string | null;
  } | null;
};

function parseReplyMeta(payload: unknown): MessageReplyMeta | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const messageId = typeof row.reply_to_message_id === "string" ? row.reply_to_message_id : "";
  const sender = typeof row.reply_to_sender_display_name === "string" ? row.reply_to_sender_display_name : "";
  const text = typeof row.reply_to_text === "string" ? row.reply_to_text : "";
  if (!messageId || !sender || !text) return null;
  return {
    reply_to_message_id: messageId,
    reply_to_sender_display_name: sender,
    reply_to_text: text,
  };
}

export function ChatPanel({
  scope,
  leagueId = null,
  title,
  className,
  messageListClassName,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [shareCaption, setShareCaption] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareables, setShareables] = useState<ShareablePrediction[]>([]);
  const [shareGameweeks, setShareGameweeks] = useState<number[]>([]);
  const [selectedGameweek, setSelectedGameweek] = useState<number | null>(null);
  const [selectedPredictionId, setSelectedPredictionId] = useState<string | null>(null);
  const [loadingShareables, setLoadingShareables] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banUserId, setBanUserId] = useState("");
  const [canModerate, setCanModerate] = useState(false);
  const [bans, setBans] = useState<Array<{ id: string; banned_user_id: string; reason: string | null }>>([]);
  const [sending, setSending] = useState(false);
  const [modMessage, setModMessage] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [reportDialogMessage, setReportDialogMessage] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reports, setReports] = useState<ChatMessageReport[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const {
    messages,
    loading,
    error,
    sendTextMessage,
    sendPredictionShare,
    fetchShareablePredictions,
  } = useChatMessages({ scope, leagueId });

  const ordered = useMemo(
    () => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages]
  );
  const messageIds = useMemo(() => ordered.map((m) => m.id), [ordered]);
  const {
    summaryById: messageReactionSummaryById,
    pendingById: messageReactionPendingById,
    react: reactToMessage,
  } = useReactions("chat_message", messageIds);

  useEffect(() => {
    if (scope !== "league" || !leagueId) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/chat/bans?leagueId=${encodeURIComponent(leagueId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setCanModerate(!!body.can_moderate);
        if (Array.isArray(body.bans)) setBans(body.bans);
      }
    });
  }, [leagueId, scope]);

  useEffect(() => {
    if (scope !== "league" || !leagueId || !canModerate) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/chat/reports?leagueId=${encodeURIComponent(leagueId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body.reports)) {
        setReports(body.reports as ChatMessageReport[]);
      }
    });
  }, [canModerate, leagueId, scope]);

  async function loadShareables(gameweek?: number | null) {
    setLoadingShareables(true);
    const data = await fetchShareablePredictions(gameweek);
    setLoadingShareables(false);
    setShareGameweeks(data.gameweeks);
    const gw =
      typeof gameweek === "number" && gameweek > 0
        ? gameweek
        : data.gameweeks.length > 0
          ? data.gameweeks[0]
          : null;
    setSelectedGameweek(gw);
    setShareables(data.predictions);
    if (data.predictions.length > 0) {
      setSelectedPredictionId((prev) => {
        const stillPresent = prev && data.predictions.some((p) => p.prediction_id === prev);
        return stillPresent ? prev : data.predictions[0].prediction_id;
      });
    } else {
      setSelectedPredictionId(null);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const ok = await sendTextMessage(text, {
      replyToMessageId: replyToMessage?.id ?? null,
    });
    setSending(false);
    if (ok) {
      setText("");
      setReplyToMessage(null);
      queueMicrotask(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    }
  }

  async function onSharePrediction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPredictionId) return;
    setSending(true);
    const selected = shareables.find((p) => p.prediction_id === selectedPredictionId) ?? null;
    const ok = await sendPredictionShare({
      predictionId: selectedPredictionId,
      caption: shareCaption,
      optimisticPrediction: selected,
    });
    setSending(false);
    if (ok) {
      setShareCaption("");
      setShareOpen(false);
      setSelectedPredictionId(null);
    }
  }

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHold(message: ChatMessage) {
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      setActionMessage(message);
      holdTimerRef.current = null;
    }, 420);
  }

  async function submitReport() {
    if (!reportDialogMessage) return;
    setReporting(true);
    setReportFeedback(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setReporting(false);
      setReportFeedback("Please log in to report messages.");
      return;
    }
    const res = await fetch("/api/chat/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        scope,
        leagueId: scope === "league" ? leagueId : null,
        messageId: reportDialogMessage.id,
        reason: reportReason,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setReporting(false);
    if (!res.ok) {
      setReportFeedback(typeof body.error === "string" ? body.error : "Failed to report message.");
      return;
    }
    setReportFeedback("Report submitted.");
    setReportDialogMessage(null);
    setReportReason("");
    if (scope === "league" && leagueId && canModerate) {
      const refresh = await fetch(`/api/chat/reports?leagueId=${encodeURIComponent(leagueId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const refreshBody = await refresh.json().catch(() => ({}));
      if (refresh.ok && Array.isArray(refreshBody.reports)) {
        setReports(refreshBody.reports as ChatMessageReport[]);
      }
    }
  }

  async function banUser() {
    if (!leagueId || !banUserId.trim()) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/chat/bans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        leagueId,
        bannedUserId: banUserId.trim(),
        reason: banReason,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setModMessage(typeof body.error === "string" ? body.error : "Failed to ban user.");
      return;
    }
    setModMessage("User chat banned.");
    setBans((prev) => {
      const next = prev.filter((b) => b.banned_user_id !== body.ban.banned_user_id);
      return [{ id: body.ban.id, banned_user_id: body.ban.banned_user_id, reason: body.ban.reason }, ...next];
    });
    setBanUserId("");
    setBanReason("");
  }

  async function unbanUser(bannedUserId: string) {
    if (!leagueId) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/chat/bans", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        leagueId,
        bannedUserId,
      }),
    });
    if (res.ok) {
      setBans((prev) => prev.filter((b) => b.banned_user_id !== bannedUserId));
    }
  }

  function renderPredictionCard(m: ChatMessage) {
    if (m.message_type !== "prediction_share" || !m.prediction_payload || typeof m.prediction_payload !== "object") {
      return null;
    }
    const payload = m.prediction_payload as ShareablePrediction;
    const fixture = payload.fixture;
    if (!fixture) return null;
    return (
      <div className="mt-1 rounded border border-border bg-background/70 p-2 text-xs">
        <p className="font-medium text-foreground">
          {fixture.home_team} vs {fixture.away_team}
        </p>
        <p className="text-muted-foreground">
          GW {fixture.gameweek} | {formatShortDate(fixture.kickoff_time)}
        </p>
        <p className="text-muted-foreground">
          Prediction: {payload.pred_home_goals}-{payload.pred_away_goals} ({payload.pick})
        </p>
        <p className="text-muted-foreground">Result: {formatScore(fixture.home_goals, fixture.away_goals)}</p>
        <p
          className={
            payload.settled_at
              ? payload.total_points < 0
                ? "text-destructive"
                : "text-primary"
              : "text-muted-foreground"
          }
        >
          Points: {payload.settled_at ? payload.total_points : "Pending"}
        </p>
      </div>
    );
  }

  return (
    <section className={`rounded-lg border border-border bg-card ${className ?? ""}`}>
      <header className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </header>

      <div
        ref={listRef}
        className={`${messageListClassName ?? "h-[280px]"} overflow-y-auto px-3 py-3 space-y-2`}
      >
        {loading && <p className="text-sm text-muted-foreground">Loading chat…</p>}
        {!loading && ordered.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
        )}
        {ordered.map((m) => (
          <article
            key={m.id}
            className="rounded-md border border-border/70 bg-muted/20 p-2"
            onContextMenu={(e) => {
              e.preventDefault();
              clearHoldTimer();
              setActionMessage(m);
            }}
            onPointerDown={() => startHold(m)}
            onPointerUp={clearHoldTimer}
            onPointerCancel={clearHoldTimer}
            onPointerLeave={clearHoldTimer}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar favouriteTeam={m.sender_favourite_team} size={18} />
                <p className="truncate text-xs font-medium text-foreground">
                  {m.sender_display_name}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">{formatTime(m.created_at)}</span>
            </div>
            {m.message_type === "text" && parseReplyMeta(m.prediction_payload) && (
              <div className="mb-1 rounded border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                <p className="font-medium">
                  Replying to {parseReplyMeta(m.prediction_payload)?.reply_to_sender_display_name}
                </p>
                <p className="line-clamp-2">{parseReplyMeta(m.prediction_payload)?.reply_to_text}</p>
              </div>
            )}
            <p className={`text-sm ${m.failed ? "text-destructive" : "text-foreground"}`}>
              {m.text ?? ""}
              {m.pending ? " (sending…)" : ""}
              {m.failed ? " (failed)" : ""}
            </p>
            {renderPredictionCard(m)}
            <ReactionBar
              summary={messageReactionSummaryById[m.id]}
              pending={!!messageReactionPendingById[m.id]}
              disabled={m.pending || !isUuid(m.id)}
              onReact={(emoji) => {
                void reactToMessage(m.id, emoji);
              }}
              compact
              className="mt-2"
            />
          </article>
        ))}
      </div>

      <form onSubmit={onSend} className="border-t border-border p-3 space-y-2">
        {replyToMessage && (
          <div className="flex items-start justify-between gap-2 rounded border border-border bg-muted/30 p-2 text-xs">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Replying to {replyToMessage.sender_display_name}</p>
              <p className="truncate text-muted-foreground">{replyToMessage.text ?? "[no text]"}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReplyToMessage(null)}>
              Cancel
            </Button>
          </div>
        )}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={1000}
          className="bg-background border-border"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{error ?? "\u00A0"}</p>
          <Button type="submit" size="sm" disabled={sending || !text.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              const next = !shareOpen;
              setShareOpen(next);
              if (next) await loadShareables();
            }}
          >
            {shareOpen ? "Close sharing" : "Share prediction"}
          </Button>
        </div>
        {shareOpen && (
          <form onSubmit={onSharePrediction} className="space-y-2">
            {shareGameweeks.length > 0 && (
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedGameweek ?? ""}
                onChange={async (e) => {
                  const nextGameweek = Number(e.target.value);
                  if (!Number.isInteger(nextGameweek) || nextGameweek <= 0) return;
                  setSelectedGameweek(nextGameweek);
                  await loadShareables(nextGameweek);
                }}
              >
                {shareGameweeks.map((gw) => (
                  <option key={gw} value={gw}>
                    Gameweek {gw}
                  </option>
                ))}
              </select>
            )}
            {loadingShareables && <p className="text-xs text-muted-foreground">Loading predictions…</p>}
            {!loadingShareables && shareables.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No predictions available for this gameweek.
              </p>
            )}
            {!loadingShareables && shareables.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                {shareables.map((p) => (
                  <button
                    key={p.prediction_id}
                    type="button"
                    onClick={() => setSelectedPredictionId(p.prediction_id)}
                    className={`w-full rounded border p-2 text-left text-xs transition-colors ${
                      selectedPredictionId === p.prediction_id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <p className="font-medium text-foreground">
                      {p.fixture.home_team} vs {p.fixture.away_team}
                    </p>
                    <p className="text-muted-foreground">
                      Pred: {p.pred_home_goals}-{p.pred_away_goals} ({p.pick}) | Result:{" "}
                      {formatScore(p.fixture.home_goals, p.fixture.away_goals)}
                    </p>
                    <p
                      className={
                        p.settled_at
                          ? p.total_points < 0
                            ? "text-destructive"
                            : "text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      Points: {p.settled_at ? p.total_points : "Pending"}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <Input
              value={shareCaption}
              onChange={(e) => setShareCaption(e.target.value)}
              placeholder="Optional caption"
              maxLength={250}
            />
            <Button type="submit" size="sm" disabled={sending || !selectedPredictionId}>
              Share
            </Button>
          </form>
        )}
      </div>
      {scope === "league" && canModerate && (
        <div className="border-t border-border p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Moderator tools</p>
          <Input
            value={banUserId}
            onChange={(e) => setBanUserId(e.target.value)}
            placeholder="User ID to chat-ban"
          />
          <Input
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={250}
          />
          <Button type="button" size="sm" variant="destructive" onClick={banUser}>
            Ban from league chat
          </Button>
          {modMessage && <p className="text-xs text-muted-foreground">{modMessage}</p>}
          {bans.length > 0 && (
            <div className="space-y-1">
              {bans.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded border border-border p-2 text-xs">
                  <span className="truncate pr-2">
                    {b.banned_user_id}
                    {b.reason ? ` - ${b.reason}` : ""}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => unbanUser(b.banned_user_id)}>
                    Unban
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border/70 pt-2">
            <p className="text-xs font-semibold text-foreground">Reported messages</p>
            {reports.length === 0 && <p className="text-xs text-muted-foreground">No reports yet.</p>}
            {reports.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {reports.map((r) => (
                  <div key={r.id} className="rounded border border-border p-2 text-xs">
                    <p className="text-foreground">
                      {r.message_snapshot?.reporter_display_name ?? "Player"} reported{" "}
                      {r.message_snapshot?.sender_display_name ?? "Player"}
                    </p>
                    <p className="line-clamp-2 text-muted-foreground">{r.message_snapshot?.message_text ?? "[no text]"}</p>
                    {r.reason && <p className="text-muted-foreground">Reason: {r.reason}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {formatShortDate(r.created_at)} {formatTime(r.created_at)} | {r.status ?? "open"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <Dialog open={!!actionMessage} onOpenChange={(open) => !open && setActionMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message actions</DialogTitle>
            <DialogDescription>
              Reply, react, or report this message.
            </DialogDescription>
          </DialogHeader>
          {actionMessage && (
            <div className="space-y-3">
              <div className="rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{actionMessage.sender_display_name}</p>
                <p className="line-clamp-3">{actionMessage.text ?? "[no text]"}</p>
              </div>
              <ReactionBar
                summary={messageReactionSummaryById[actionMessage.id]}
                pending={!!messageReactionPendingById[actionMessage.id]}
                disabled={actionMessage.pending || !isUuid(actionMessage.id)}
                onReact={(emoji) => {
                  void reactToMessage(actionMessage.id, emoji);
                }}
                compact
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!actionMessage) return;
                setReplyToMessage(actionMessage);
                setActionMessage(null);
              }}
            >
              Reply
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!actionMessage) return;
                setReportDialogMessage(actionMessage);
                setActionMessage(null);
              }}
            >
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!reportDialogMessage} onOpenChange={(open) => !open && setReportDialogMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report message</DialogTitle>
            <DialogDescription>
              Add an optional reason. A snapshot of this message and users is saved for moderators.
            </DialogDescription>
          </DialogHeader>
          {reportDialogMessage && (
            <div className="space-y-2">
              <div className="rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{reportDialogMessage.sender_display_name}</p>
                <p className="line-clamp-3">{reportDialogMessage.text ?? "[no text]"}</p>
              </div>
              <Input
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Optional reason"
                maxLength={250}
              />
              {reportFeedback && <p className="text-xs text-muted-foreground">{reportFeedback}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportDialogMessage(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={reporting} onClick={() => void submitReport()}>
              {reporting ? "Reporting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

