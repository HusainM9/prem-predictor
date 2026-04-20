"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/avatar/UserAvatar";
import { supabase } from "@/lib/supabase/client";
import {
  useChatMessages,
  type ChatScope,
  type ShareablePrediction,
  type ChatMessage,
} from "@/hooks/useChatMessages";

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
  const listRef = useRef<HTMLDivElement | null>(null);
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
    const ok = await sendTextMessage(text);
    setSending(false);
    if (ok) {
      setText("");
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
          <article key={m.id} className="rounded-md border border-border/70 bg-muted/20 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar favouriteTeam={m.sender_favourite_team} size={18} />
                <p className="truncate text-xs font-medium text-foreground">
                  {m.sender_display_name}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">{formatTime(m.created_at)}</span>
            </div>
            <p className={`text-sm ${m.failed ? "text-destructive" : "text-foreground"}`}>
              {m.text ?? ""}
              {m.pending ? " (sending…)" : ""}
              {m.failed ? " (failed)" : ""}
            </p>
            {renderPredictionCard(m)}
          </article>
        ))}
      </div>

      <form onSubmit={onSend} className="border-t border-border p-3 space-y-2">
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
        </div>
      )}
    </section>
  );
}

