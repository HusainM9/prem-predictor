"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PREMIER_LEAGUE_TEAMS } from "@/lib/premier-league-teams";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FavouriteTeamPrompt() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const sortedTeams = useMemo(
    () => [...PREMIER_LEAGUE_TEAMS].sort((a, b) => a.localeCompare(b)),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      const favouriteTeam =
        typeof data.favourite_team === "string" ? data.favourite_team : null;

      if (!favouriteTeam) {
        setOpen(true);
      }
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveFavouriteTeam() {
    if (!selectedTeam || loading) return;
    setSaving(true);
    setMsg(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ favourite_team: selectedTeam }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setMsg(
        typeof data.error === "string"
          ? data.error
          : "Could not save favourite team right now."
      );
      return;
    }

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pick your favourite team</DialogTitle>
          <DialogDescription>
            Choose your club to use its crest as your profile picture in
            leaderboard, chat, and predictions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger>
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {sortedTeams.map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={saveFavouriteTeam}
            disabled={!selectedTeam || saving}
          >
            {saving ? "Saving…" : "Save team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

