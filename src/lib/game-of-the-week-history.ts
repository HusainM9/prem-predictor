/**
 * In-memory Game of the Week history for a season (batched fixtures + votes).
 */

import { getGotwAnchorKickoffIso, getGotwVoteCloseMs } from "./gotw-close";

export type GotwHistoryFixture = {
  id: string;
  gameweek: number;
  kickoff_time: string;
  status: string;
  home_team: string;
  away_team: string;
};

export type GotwHistoryVote = {
  gameweek: number;
  fixture_id: string;
  created_at: string;
  user_id: string;
};

export type GotwHistoryWinner = {
  fixture_id: string;
  home_team: string;
  away_team: string;
};

export type GotwHistoryEntry = {
  gameweek: number;
  first_kickoff: string | null;
  voting_closed: boolean;
  winner: GotwHistoryWinner | null;
  my_vote_fixture_id: string | null;
  my_vote: GotwHistoryWinner | null;
  picked_winner: boolean | null;
};

function winnerFromTally(
  fixtureById: Map<string, { home_team: string; away_team: string }>,
  countByFixture: Map<string, number>
): GotwHistoryWinner | null {
  let winnerId: string | null = null;
  let maxCount = 0;
  for (const [fid, c] of countByFixture) {
    if (c > maxCount) {
      maxCount = c;
      winnerId = fid;
    }
  }
  if (!winnerId || maxCount === 0) return null;
  const fx = fixtureById.get(winnerId);
  if (!fx) return null;
  return { fixture_id: winnerId, home_team: fx.home_team, away_team: fx.away_team };
}

export function buildGotwHistory(
  fixtures: GotwHistoryFixture[],
  allVotes: GotwHistoryVote[],
  userId: string,
  nowMs: number = Date.now()
): GotwHistoryEntry[] {
  const byGw = new Map<number, GotwHistoryFixture[]>();
  for (const f of fixtures) {
    if (f.status === "postponed") continue;
    const list = byGw.get(f.gameweek) ?? [];
    list.push(f);
    byGw.set(f.gameweek, list);
  }
  for (const [, list] of byGw) {
    list.sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
  }

  const myVoteByGw = new Map<number, string>();
  for (const v of allVotes) {
    if (v.user_id !== userId) continue;
    myVoteByGw.set(v.gameweek, v.fixture_id);
  }

  const gameweeks = [...byGw.keys()].sort((a, b) => a - b);
  const entries: GotwHistoryEntry[] = [];

  for (const gameweek of gameweeks) {
    const gwFixtures = byGw.get(gameweek) ?? [];
    const kickoffs = gwFixtures.map((x) => x.kickoff_time);
    const firstKickoff = getGotwAnchorKickoffIso(kickoffs) ?? gwFixtures[0]?.kickoff_time ?? null;
    if (!firstKickoff) continue;

    const closeMs = getGotwVoteCloseMs(kickoffs);
    if (closeMs == null) continue;
    const voting_closed = nowMs >= closeMs;

    const fixtureIds = new Set(gwFixtures.map((x) => x.id));
    const fixtureById = new Map(
      gwFixtures.map((x) => [x.id, { home_team: x.home_team, away_team: x.away_team }] as const)
    );

    const countByFixture = new Map<string, number>();
    for (const v of allVotes) {
      if (new Date(v.created_at).getTime() >= closeMs) continue;
      if (!fixtureIds.has(v.fixture_id)) continue;
      countByFixture.set(v.fixture_id, (countByFixture.get(v.fixture_id) ?? 0) + 1);
    }

    const winner = voting_closed ? winnerFromTally(fixtureById, countByFixture) : null;
    const my_vote_fixture_id = myVoteByGw.get(gameweek) ?? null;
    const myFx = my_vote_fixture_id ? gwFixtures.find((x) => x.id === my_vote_fixture_id) : null;
    const my_vote: GotwHistoryWinner | null =
      myFx != null
        ? { fixture_id: myFx.id, home_team: myFx.home_team, away_team: myFx.away_team }
        : null;

    let picked_winner: boolean | null = null;
    if (winner && my_vote_fixture_id) {
      picked_winner = winner.fixture_id === my_vote_fixture_id;
    } else if (!winner) {
      picked_winner = null;
    } else {
      picked_winner = null;
    }

    entries.push({
      gameweek,
      first_kickoff: firstKickoff,
      voting_closed,
      winner,
      my_vote_fixture_id,
      my_vote,
      picked_winner,
    });
  }

  return entries.sort((a, b) => b.gameweek - a.gameweek);
}
