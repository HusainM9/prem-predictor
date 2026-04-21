"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const DEFAULT_CHAT_RETENTION_MS = 60 * 60 * 1000;

function pruneByRetention(messages: ChatMessage[], maxAgeMs: number): ChatMessage[] {
  const cutoff = Date.now() - maxAgeMs;
  return messages.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export type ChatScope = "general" | "league";

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
    status: string | null;
    home_goals: number | null;
    away_goals: number | null;
  };
};

type UseChatOptions = {
  scope: ChatScope;
  leagueId?: string | null;
  limit?: number;
};

function buildQueryString(scope: ChatScope, leagueId?: string | null, limit = 50): string {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  if (scope === "league" && leagueId) params.set("leagueId", leagueId);
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

export function useChatMessages({ scope, leagueId = null, limit = 50 }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retentionMsRef = useRef(DEFAULT_CHAT_RETENTION_MS);
  const channelKey = useMemo(() => `${scope}:${leagueId ?? "global"}`, [scope, leagueId]);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const qs = buildQueryString(scope, leagueId, limit);
    const res = await fetch(`/api/chat/messages?${qs}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load chat");
      setMessages([]);
      setLoading(false);
      return;
    }
    const maxAge =
      typeof data.retention?.maxAgeMs === "number" && data.retention.maxAgeMs > 0
        ? data.retention.maxAgeMs
        : DEFAULT_CHAT_RETENTION_MS;
    retentionMsRef.current = maxAge;
    const list = Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
    setMessages(pruneByRetention(list, maxAge));
    setLoading(false);
  }, [leagueId, limit, scope]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInitial();
    });
  }, [fetchInitial]);

  /** Drop messages that scroll past the server retention window while the tab stays open. */
  useEffect(() => {
    const id = setInterval(() => {
      setMessages((prev) => pruneByRetention(prev, retentionMsRef.current));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

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
          void fetchInitial();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelKey, fetchInitial, leagueId, scope]);

  const sendMessage = useCallback(
    async ({
      text,
      messageType,
      predictionId,
      optimisticPrediction,
    }: {
      text?: string;
      messageType: "text" | "prediction_share";
      predictionId?: string;
      optimisticPrediction?: ShareablePrediction | null;
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
      setMessages((prev) => dedupeById([...prev, optimistic]));

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
        return pruneByRetention(next, retentionMsRef.current);
      });
      return true;
    },
    [leagueId, scope]
  );

  const sendTextMessage = useCallback(
    async (text: string) => sendMessage({ text, messageType: "text" }),
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
    error,
    sendTextMessage,
    sendPredictionShare,
    fetchShareablePredictions,
    refresh: fetchInitial,
  };
}

