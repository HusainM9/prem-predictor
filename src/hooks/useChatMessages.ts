"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { CHAT_PAGE_SIZE } from "@/lib/chat/limits";

const DEFAULT_RETENTION_WHEN_UNKNOWN_MS = 60 * 60 * 1000;
const CHAT_LIVE_REFRESH_INTERVAL_MS = 3_000;

function pruneByRetention(messages: ChatMessage[], maxAgeMs: number): ChatMessage[] {
  const cutoff = Date.now() - maxAgeMs;
  return messages.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function applyRetentionList(list: ChatMessage[], maxAgeMs: number | null | undefined): ChatMessage[] {
  if (maxAgeMs == null || !Number.isFinite(maxAgeMs) || maxAgeMs > 7 * 24 * 60 * 60 * 1000) {
    return list;
  }
  return pruneByRetention(list, maxAgeMs);
}

export type ChatMessage = {
  id: string;
  user_id: string;
  league_id: string | null;
  message_type: "text" | "prediction_share";
  text: string | null;
  prediction_payload: unknown;
  created_at: string;
  sender_display_name: string;
  sender_favourite_team: string | null;
  pending?: boolean;
  failed?: boolean;
};

export type ShareablePrediction = {
  prediction_id: string;
  fixture_id: string;
  pred_home_goals: number;
  pred_away_goals: number;
  pick: "H" | "D" | "A";
  submitted_at: string;
  points_awarded: number;
  bonus_points: number;
  total_points: number;
  settled_at: string | null;
  fixture: {
    home_team: string;
    away_team: string;
    kickoff_time: string;
    gameweek: number;
    status: string;
    home_goals: number | null;
    away_goals: number | null;
  };
};

export type ChatReplyMeta = {
  reply_to_message_id: string;
  reply_to_sender_display_name: string;
  reply_to_text: string;
};

export type ChatScope = "general" | "league";

type UseChatOptions = {
  scope: ChatScope;
  leagueId?: string | null;
  limit?: number;
};

function buildQueryString(
  scope: "general" | "league",
  leagueId: string | null | undefined,
  pageSize: number,
  before?: string | null
): string {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(pageSize));
  if (scope === "league" && leagueId) params.set("leagueId", leagueId);
  if (before && before.trim()) params.set("before", before.trim());
  return params.toString();
}

function dedupeById(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function useChatMessages({ scope, leagueId = null, limit = CHAT_PAGE_SIZE }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retentionMsRef = useRef<number | null | undefined>(null);
  const mergeLatestTailInFlightRef = useRef(false);
  const [retentionMsForPrune, setRetentionMsForPrune] = useState<number | null>(null);
  const channelKey = useMemo(() => `${scope}:${leagueId ?? "global"}`, [scope, leagueId]);

  const maxAgeForPrune = useMemo(() => {
    const v = retentionMsForPrune;
    if (v == null) return null;
    if (!Number.isFinite(v) || v > 7 * 24 * 60 * 60 * 1000) return null;
    return v;
  }, [retentionMsForPrune]);

  const fetchPage = useCallback(
    async (opts: { before?: string | null; replace: boolean }): Promise<void> => {
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (opts.replace) {
          setMessages([]);
          setHasMore(false);
          setLoading(false);
        }
        return;
      }

      const qs = buildQueryString(scope, leagueId, limit, opts.before);
      const res = await fetch(`/api/chat/messages?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load chat");
        if (opts.replace) {
          setMessages([]);
          setHasMore(false);
        }
        if (opts.replace) setLoading(false);
        if (!opts.replace) setLoadingMore(false);
        return;
      }

      const maxAgeRaw = data.retention?.maxAgeMs;
      if (maxAgeRaw == null) {
        retentionMsRef.current = null;
        setRetentionMsForPrune(null);
      } else if (typeof maxAgeRaw === "number" && maxAgeRaw > 0) {
        retentionMsRef.current = maxAgeRaw;
        setRetentionMsForPrune(maxAgeRaw);
      } else {
        retentionMsRef.current = DEFAULT_RETENTION_WHEN_UNKNOWN_MS;
        setRetentionMsForPrune(DEFAULT_RETENTION_WHEN_UNKNOWN_MS);
      }

      const list = Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
      const more = data.hasMore === true;
      const maxAge = retentionMsRef.current;

      if (opts.replace) {
        setMessages(applyRetentionList(list, maxAge));
        setHasMore(more);
        setLoading(false);
        return;
      }

      setMessages((prev) => {
        const merged = dedupeById([...list, ...prev]).sort((a, b) => a.created_at.localeCompare(b.created_at));
        return applyRetentionList(merged, maxAge);
      });
      setHasMore(more);
      setLoadingMore(false);
    },
    [leagueId, limit, scope]
  );

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setHasMore(false);
    await fetchPage({ replace: true });
  }, [fetchPage]);

  const loadOlder = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const oldest = ordered[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      await fetchPage({ before: oldest.created_at, replace: false });
    } catch {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loading, loadingMore, messages]);

  /** Merge the latest page with older message*/
  const mergeLatestTail = useCallback(async () => {
    if (mergeLatestTailInFlightRef.current) return;
    mergeLatestTailInFlightRef.current = true;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const qs = buildQueryString(scope, leagueId, limit, null);
      const res = await fetch(`/api/chat/messages?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const maxAge =
        data.retention?.maxAgeMs == null
          ? null
          : typeof data.retention.maxAgeMs === "number" && data.retention.maxAgeMs > 0
            ? data.retention.maxAgeMs
            : DEFAULT_RETENTION_WHEN_UNKNOWN_MS;
      retentionMsRef.current = maxAge;
      setRetentionMsForPrune(maxAge ?? null);
      const tail = Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
      if (tail.length === 0) return;
      setMessages((prev) => {
        const tMin = tail[0].created_at;
        const pending = prev.filter((m) => m.pending);
        const kept = prev.filter((m) => !m.pending && m.created_at < tMin);
        const merged = dedupeById([...kept, ...tail, ...pending]).sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
        return applyRetentionList(merged, maxAge);
      });
      if (data.hasMore === true) {
        setHasMore(true);
      }
    } finally {
      mergeLatestTailInFlightRef.current = false;
    }
  }, [leagueId, limit, scope]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInitial();
    });
  }, [fetchInitial]);

  useEffect(() => {
    if (maxAgeForPrune == null) return;
    const id = setInterval(() => {
      setMessages((prev) => pruneByRetention(prev, maxAgeForPrune));
    }, 30_000);
    return () => clearInterval(id);
  }, [maxAgeForPrune]);

  useEffect(() => {
    const filter =
      scope === "general"
        ? "league_id=is.null"
        : leagueId
          ? `league_id=eq.${leagueId}`
          : undefined;

    const channel = supabase
      .channel(`chat-${channelKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          ...(filter ? { filter } : {}),
        },
        () => {
          void mergeLatestTail();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelKey, leagueId, mergeLatestTail, scope]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void mergeLatestTail();
    };
    const onFocus = () => {
      void mergeLatestTail();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [mergeLatestTail]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void mergeLatestTail();
      }
    };
    const id = window.setInterval(refreshWhenVisible, CHAT_LIVE_REFRESH_INTERVAL_MS);
    refreshWhenVisible();
    return () => window.clearInterval(id);
  }, [mergeLatestTail]);

  const sendMessage = useCallback(
    async ({
      text,
      messageType,
      predictionId,
      optimisticPrediction,
      replyTo,
    }: {
      text?: string;
      messageType: "text" | "prediction_share";
      predictionId?: string;
      optimisticPrediction?: ShareablePrediction | null;
      replyTo?: { messageId: string } | null;
    }) => {
      const trimmed = (text ?? "").trim();
      if (messageType === "text" && !trimmed) return false;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!session?.access_token || !user) {
        setError("You need to log in to chat.");
        return false;
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: ChatMessage = {
        id: tempId,
        user_id: user.id,
        league_id: scope === "league" ? leagueId : null,
        message_type: messageType,
        text: trimmed || null,
        prediction_payload: messageType === "prediction_share" ? optimisticPrediction ?? null : null,
        created_at: new Date().toISOString(),
        sender_display_name: "You",
        sender_favourite_team: null,
        pending: true,
      };
      setMessages((prev) => {
        const next = dedupeById([...prev, optimistic]).sort((a, b) => a.created_at.localeCompare(b.created_at));
        return applyRetentionList(next, retentionMsRef.current);
      });

      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          scope,
          leagueId: scope === "league" ? leagueId : null,
          messageType,
          text: trimmed,
          predictionId: messageType === "prediction_share" ? predictionId ?? null : null,
          replyTo:
            messageType === "text" && replyTo?.messageId
              ? {
                  messageId: replyTo.messageId,
                }
              : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
        );
        setError(typeof data.error === "string" ? data.error : "Failed to send message.");
        return false;
      }

      const confirmed = data.message as ChatMessage;
      setMessages((prev) => {
        const replaced = prev
          .filter((m) => m.id !== tempId)
          .concat(confirmed ? [confirmed] : []);
        const next = dedupeById(replaced).sort((a, b) => a.created_at.localeCompare(b.created_at));
        return applyRetentionList(next, retentionMsRef.current);
      });
      return true;
    },
    [leagueId, scope]
  );

  const sendTextMessage = useCallback(
    async (text: string, options?: { replyToMessageId?: string | null }) =>
      sendMessage({
        text,
        messageType: "text",
        replyTo:
          options?.replyToMessageId && options.replyToMessageId.trim().length > 0
            ? { messageId: options.replyToMessageId.trim() }
            : null,
      }),
    [sendMessage]
  );

  const sendPredictionShare = useCallback(
    async (args: { predictionId: string; caption?: string; optimisticPrediction?: ShareablePrediction | null }) =>
      sendMessage({
        text: args.caption ?? "",
        messageType: "prediction_share",
        predictionId: args.predictionId,
        optimisticPrediction: args.optimisticPrediction ?? null,
      }),
    [sendMessage]
  );

  const fetchShareablePredictions = useCallback(async (gameweek?: number | null) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return { gameweeks: [] as number[], predictions: [] as ShareablePrediction[] };

    const params = new URLSearchParams();
    params.set("limit", "50");
    if (typeof gameweek === "number" && Number.isInteger(gameweek) && gameweek > 0) {
      params.set("gameweek", String(gameweek));
    }
    const res = await fetch(`/api/chat/shareable-predictions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.predictions) || !Array.isArray(data.gameweeks)) {
      return { gameweeks: [] as number[], predictions: [] as ShareablePrediction[] };
    }
    return {
      gameweeks: data.gameweeks as number[],
      predictions: data.predictions as ShareablePrediction[],
    };
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    sendTextMessage,
    sendPredictionShare,
    fetchShareablePredictions,
    refresh: fetchInitial,
    loadOlder,
  };
}
