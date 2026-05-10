import { describe, it, expect } from "vitest";
import {
  normalizeName,
  isReservedLeagueName,
  validateLeagueName,
  validateDisplayName,
  containsProfanity,
  DISPLAY_NAME_MAX_LENGTH,
} from "./name-validation";

describe("normalizeName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeName("  foo  ")).toBe("foo");
    expect(normalizeName("\tbar\n")).toBe("bar");
  });

  it("collapses internal whitespace to a single space", () => {
    expect(normalizeName("foo   bar")).toBe("foo bar");
    expect(normalizeName("  a   b   c  ")).toBe("a b c");
  });

  it("returns empty string for null, undefined, or empty", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("isReservedLeagueName", () => {
  it("returns true for exact reserved names (case-insensitive)", () => {
    expect(isReservedLeagueName("Global")).toBe(true);
    expect(isReservedLeagueName("global")).toBe(true);
    expect(isReservedLeagueName("GLOBAL LEAGUE")).toBe(true);
    expect(isReservedLeagueName("global leaderboard")).toBe(true);
  });

  it("returns false for similar but not reserved names", () => {
    expect(isReservedLeagueName("Global Friends")).toBe(false);
    expect(isReservedLeagueName("Global Picks")).toBe(false);
    expect(isReservedLeagueName("My Global League")).toBe(false);
    expect(isReservedLeagueName("")).toBe(false);
    expect(isReservedLeagueName(null)).toBe(false);
  });
});

describe("validateLeagueName", () => {
  it("rejects empty name", () => {
    expect(validateLeagueName("")).toEqual({ valid: false, error: "League name is required" });
    expect(validateLeagueName("   ")).toEqual({ valid: false, error: "League name is required" });
  });

  it("rejects reserved names with clear message", () => {
    expect(validateLeagueName("Global")).toEqual({
      valid: false,
      error: "This name is reserved. Please choose a different league name.",
    });
    expect(validateLeagueName("global league")).toEqual({
      valid: false,
      error: "This name is reserved. Please choose a different league name.",
    });
  });

  it("rejects names containing profanity", () => {
    const result = validateLeagueName("My shit league");
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toContain("isn't allowed");
  });

  it("accepts normal league names", () => {
    expect(validateLeagueName("Work League")).toEqual({ valid: true });
    expect(validateLeagueName("Family")).toEqual({ valid: true });
    expect(validateLeagueName("Prem Picks 2025")).toEqual({ valid: true });
  });
});

describe("validateDisplayName", () => {
  it("rejects empty name", () => {
    expect(validateDisplayName("")).toEqual({ valid: false, error: "Display name is required" });
    expect(validateDisplayName("   ")).toEqual({ valid: false, error: "Display name is required" });
  });

  it("rejects names over max length", () => {
    const long = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const result = validateDisplayName(long);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toContain("at most");
  });

  it("rejects names containing profanity", () => {
    const result = validateDisplayName("My shit name");
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toContain("isn't allowed");
  });

  it("accepts normal display names", () => {
    expect(validateDisplayName("Alice")).toEqual({ valid: true });
    expect(validateDisplayName("Bob")).toEqual({ valid: true });
    expect(validateDisplayName("Prem Fan")).toEqual({ valid: true });
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH))).toEqual({ valid: true });
  });
});

describe("containsProfanity", () => {
  it("returns true for strings containing profanity (leo-profanity or bad-words)", () => {
    expect(containsProfanity("shit")).toBe(true);
    expect(containsProfanity("hello shit world")).toBe(true);
  });

  it("returns false for clean strings", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("Alice")).toBe(false);
    expect(containsProfanity("Prem Fan")).toBe(false);
  });

  it("uses normalized form (trim and collapse spaces)", () => {
    expect(containsProfanity("  shit  ")).toBe(true);
    expect(containsProfanity("foo   shit   bar")).toBe(true);
  });
});
