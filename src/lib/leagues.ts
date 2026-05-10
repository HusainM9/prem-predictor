/**
 * Invite code generation and normalization for private leagues.
 * 6 characters, alphanumeric.
 */

export const INVITE_CODE_LENGTH = 6;
/** Excluding I, O, i, o, 0, 1. */
export const INVITE_CODE_ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz23456789";

export function generateInviteCode(randomBytes?: (length: number) => Uint8Array): string {
  const bytes = randomBytes
    ? randomBytes(INVITE_CODE_LENGTH)
    : new Uint8Array(INVITE_CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues && !randomBytes) {
    crypto.getRandomValues(bytes as Uint8Array);
  } else if (!randomBytes) {
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      (bytes as Uint8Array)[i] = Math.floor(Math.random() * 256);
    }
  }
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHANUM[(bytes as Uint8Array)[i] % INVITE_CODE_ALPHANUM.length];
  }
  return code;
}

/**
 * Validate that a string is a valid 6-character invite code format (exact match).
 */
export function isValidInviteCodeFormat(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  const allowed = new Set(INVITE_CODE_ALPHANUM.split(""));
  return code.split("").every((c) => allowed.has(c));
}
