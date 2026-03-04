import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names with Tailwind-aware deduplication.
 * Used by shadcn/ui and v0-style components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
