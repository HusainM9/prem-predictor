import { describe, it, expect } from "vitest";
import {
  generateInviteCode,
  isValidInviteCodeFormat,
  INVITE_CODE_LENGTH,
  INVITE_CODE_ALPHANUM,
} from "./leagues";

describe("generateInviteCode", () => {
  it("returns a string of length 6", () => {
    expect(generateInviteCode().length).toBe(INVITE_CODE_LENGTH);
    const withSeed = generateInviteCode(() => new Uint8Array(6));
    expect(withSeed.length).toBe(INVITE_CODE_LENGTH);
  });

  it("uses only allowed alphanumeric characters (no 0/O, 1/I)", () => {
    const allowed = new Set(INVITE_CODE_ALPHANUM.split(""));
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      expect(code.length).toBe(6);
      code.split("").forEach((c) => expect(allowed.has(c)).toBe(true));
    }
  });

  it("is deterministic when given a randomBytes function", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const code = generateInviteCode(() => bytes);
    expect(code.length).toBe(6);
    const code2 = generateInviteCode(() => bytes);
    expect(code).toBe(code2);
  });
});

describe("isValidInviteCodeFormat", () => {
  it("returns true for 6-char string with only allowed chars", () => {
    expect(isValidInviteCodeFormat("ABCDEF")).toBe(true);
    expect(isValidInviteCodeFormat("234567")).toBe(true);
    expect(isValidInviteCodeFormat("A2B4C6")).toBe(true);
    expect(isValidInviteCodeFormat("abcdef")).toBe(true);
    expect(isValidInviteCodeFormat("Ab3dEf")).toBe(true);
  });

  it("returns false for wrong length", () => {
    expect(isValidInviteCodeFormat("")).toBe(false);
    expect(isValidInviteCodeFormat("ABC")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEFG")).toBe(false);
  });

  it("returns false for disallowed characters (0, O, 1, I, i, o)", () => {
    expect(isValidInviteCodeFormat("ABCDE0")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEO")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDE1")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEI")).toBe(false);
    expect(isValidInviteCodeFormat("abcdei")).toBe(false);
    expect(isValidInviteCodeFormat("abcdeo")).toBe(false);
  });
});
