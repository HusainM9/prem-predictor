"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  createEmptyReactionSummary,
  type ReactionSummary,
  type ReactionTargetType,
} from "@/lib/reactions";

type SummaryMap = Record<string, ReactionSummary>;

function toSummaryMap(value: unknown): SummaryMap {
  if (!value || typeof value !== "object") return {};
  return value as SummaryMap;
}

export function useReactions(targetType: ReactionTargetType, targetIds: string[]) {
  const normalizedIds = useMemo(
    () => [...new Set(targetIds.filter(Boolean))].sort(),
    [targetIds]
  );
  const idsSet = useMemo(() => new Set(normalizedIds), [normalizedIds]);
  const key = normalizedIds.join(",");
  const [summaryById, setSummaryById] = useState<SummaryMap>({});
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const fetchInFlightRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (normalizedIds.length === 0) {
      setSummaryById({});
      return;
    }
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      params.set("targetType", targetType);
      params.set("targetIds", normalizedIds.join(","));
      const res = await fetch(`/api/reactions?${params.toString()}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const targets = toSummaryMap(data.targets);
      setSummaryById((prev) => {
        const next: SummaryMap = {};
        for (const id of normalizedIds) {
          next[id] = targets[id] ?? prev[id] ?? createEmptyReactionSummary();
        }
        return next;
      });
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [normalizedIds, targetType]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary, key]);

  useEffect(() => {
    if (normalizedIds.length === 0) return;
    const channel = supabase
      .channel(`reactions-${targetType}-${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reactions",
          filter: `target_type=eq.${targetType}`,
        },
        (payload) => {
          const newTargetId =
            typeof payload.new === "object" && payload.new && "target_id" in payload.new
              ? String(payload.new.target_id)
              : null;
          const oldTargetId =
            typeof payload.old === "object" && payload.old && "target_id" in payload.old
              ? String(payload.old.target_id)
              : null;
          if ((newTargetId && idsSet.has(newTargetId)) || (oldTargetId && idsSet.has(oldTargetId))) {
            void fetchSummary();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchSummary, idsSet, key, normalizedIds.length, targetType]);

  const react = useCallback(
    async (targetId: string, emoji: string) => {
      setMessage(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Log in to react.");
        return false;
      }
      setPendingById((prev) => ({ ...prev, [targetId]: true }));
      try {
        const res = await fetch("/api/reactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ targetType, targetId, emoji }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(typeof data.error === "string" ? data.error : "Could not save reaction.");
          return false;
        }
        setSummaryById((prev) => ({
          ...prev,
          [targetId]: (data.target as ReactionSummary) ?? prev[targetId] ?? createEmptyReactionSummary(),
        }));
        return true;
      } finally {
        setPendingById((prev) => ({ ...prev, [targetId]: false }));
      }
    },
    [targetType]
  );

  return { summaryById, pendingById, react, message };
}

