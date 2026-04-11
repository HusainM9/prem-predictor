import { describe, it, expect } from "vitest";
import { canRevealPredictionToViewer } from "./prediction-privacy";

describe("canRevealPredictionToViewer", () => {
  const fixedNow = new Date("2026-04-05T12:00:00.000Z");
  const futureKickoff = "2026-04-10T15:00:00.000Z";
  const pastKickoff = "2026-04-01T15:00:00.000Z";

  it("reveals after kickoff even for non-owner with privacy off", () => {
    expect(
      canRevealPredictionToViewer({
        isOwner: false,
        predictionsPublicBeforeLock: false,
        kickoffTimeIso: pastKickoff,
        oddsLockedAt: null,
        now: fixedNow,
      })
    ).toBe(true);
  });

  it("reveals before kickoff when odds are locked", () => {
    expect(
      canRevealPredictionToViewer({
        isOwner: false,
        predictionsPublicBeforeLock: false,
        kickoffTimeIso: futureKickoff,
        oddsLockedAt: "2026-04-09T10:00:00.000Z",
        now: fixedNow,
      })
    ).toBe(true);
  });

  it("reveals before kickoff to the owner even when privacy off", () => {
    expect(
      canRevealPredictionToViewer({
        isOwner: true,
        predictionsPublicBeforeLock: false,
        kickoffTimeIso: futureKickoff,
        oddsLockedAt: null,
        now: fixedNow,
      })
    ).toBe(true);
  });

  it("reveals before kickoff to others when public setting is on", () => {
    expect(
      canRevealPredictionToViewer({
        isOwner: false,
        predictionsPublicBeforeLock: true,
        kickoffTimeIso: futureKickoff,
        oddsLockedAt: null,
        now: fixedNow,
      })
    ).toBe(true);
  });

  it("hides before kickoff from others when privacy off and odds not locked", () => {
    expect(
      canRevealPredictionToViewer({
        isOwner: false,
        predictionsPublicBeforeLock: false,
        kickoffTimeIso: futureKickoff,
        oddsLockedAt: null,
        now: fixedNow,
      })
    ).toBe(false);
  });

  it("treats kickoff equal to now as revealed", () => {
    const t = "2026-04-05T12:00:00.000Z";
    expect(
      canRevealPredictionToViewer({
        isOwner: false,
        predictionsPublicBeforeLock: false,
        kickoffTimeIso: t,
        oddsLockedAt: null,
        now: new Date(t),
      })
    ).toBe(true);
  });
});
