import { Filter } from "bad-words";

const filter = new Filter();

export function containsProfanity(text: string): boolean {
  return filter.isProfane(text);
}

export function sanitizeChatText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function validateChatText(
  text: string,
  opts: { required?: boolean; maxLength?: number } = {}
): { ok: true; value: string } | { ok: false; error: string } {
  const required = opts.required ?? true;
  const maxLength = opts.maxLength ?? 1000;
  const value = sanitizeChatText(text);

  if (required && value.length === 0) {
    return { ok: false, error: "Message cannot be empty" };
  }
  if (value.length > maxLength) {
    return { ok: false, error: "Message too long" };
  }
  if (value.length > 0 && containsProfanity(value)) {
    return { ok: false, error: "Message contains blocked language." };
  }
  return { ok: true, value };
}

