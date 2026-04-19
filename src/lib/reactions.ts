export const QUICK_REACTION_EMOJIS = ["🔥", "😬", "😂", "👏", "💀"] as const;

export type ReactionTargetType = "match" | "prediction";

export type ReactionSummary = {
  counts: Record<string, number>;
  total: number;
  myEmoji: string | null;
};

export function createEmptyReactionSummary(): ReactionSummary {
  return {
    counts: {},
    total: 0,
    myEmoji: null,
  };
}

export function isValidReactionEmojiInput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32;
}

export function isValidReactionTargetType(value: string): value is ReactionTargetType {
  return value === "match" || value === "prediction";
}

