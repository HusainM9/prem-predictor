import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getChatMessageRetentionMs, getChatMessagesNotBeforeIso } from "./retention";

describe("chat retention", () => {
  const original = process.env.CHAT_MESSAGE_RETENTION_HOURS;

  beforeEach(() => {
    delete process.env.CHAT_MESSAGE_RETENTION_HOURS;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CHAT_MESSAGE_RETENTION_HOURS;
    else process.env.CHAT_MESSAGE_RETENTION_HOURS = original;
  });

  it("defaults to 1 hour", () => {
    expect(getChatMessageRetentionMs()).toBe(60 * 60 * 1000);
  });

  it("respects CHAT_MESSAGE_RETENTION_HOURS", () => {
    process.env.CHAT_MESSAGE_RETENTION_HOURS = "2";
    expect(getChatMessageRetentionMs()).toBe(2 * 60 * 60 * 1000);
  });

  it("getChatMessagesNotBeforeIso is within the retention window", () => {
    const before = getChatMessagesNotBeforeIso();
    const t = new Date(before).getTime();
    const now = Date.now();
    expect(now - t).toBeGreaterThanOrEqual(60 * 60 * 1000 - 2000);
    expect(now - t).toBeLessThanOrEqual(60 * 60 * 1000 + 2000);
  });
});
