export type LeagueMemberRole = "owner" | "admin" | "member" | null;

export function canModerateLeagueChat(role: LeagueMemberRole): boolean {
  return role === "owner" || role === "admin";
}

