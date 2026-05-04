export const DESIGN_PRESET_STORAGE_KEY = "scoreline-design-preset-v1";

export type DesignPreset = "emerald" | "aurora";

export const DEFAULT_DESIGN_PRESET: DesignPreset = "aurora";

export const DESIGN_PRESET_OPTIONS: { value: DesignPreset; label: string; hint: string }[] = [
  { value: "aurora", label: "Aurora", hint: "CSS-only animated colour wash" },
  { value: "emerald", label: "Emerald", hint: "Original green-on-charcoal" },
];

export function isDesignPreset(value: string | null): value is DesignPreset {
  return value === "emerald" || value === "aurora";
}

function normalizeRemovedPreset(raw: string | null): DesignPreset | null {
  if (raw === "obsidian" || raw === "royal") return "emerald";
  if (raw === "pl-ribbons-magenta" || raw === "pl-ribbons-blue") return "emerald";
  return null;
}

function migrateLegacyKeys(): DesignPreset | null {
  if (typeof window === "undefined") return null;
  const v2 = window.localStorage.getItem("scoreline-dark-look-v1");
  if (v2 === "classic") return "emerald";
  if (v2 === "pl-blue" || v2 === "pl-magenta") return "emerald";
  const v1 = window.localStorage.getItem("scoreline-palette-v1");
  if (v1 === "classic") return "emerald";
  if (v1 === "pl") return "emerald";
  return null;
}

export function readStoredDesignPreset(): DesignPreset {
  if (typeof window === "undefined") return DEFAULT_DESIGN_PRESET;
  const raw = window.localStorage.getItem(DESIGN_PRESET_STORAGE_KEY);
  if (isDesignPreset(raw)) return raw;
  const normalized = normalizeRemovedPreset(raw);
  if (normalized) {
    window.localStorage.setItem(DESIGN_PRESET_STORAGE_KEY, normalized);
    return normalized;
  }
  const migrated = migrateLegacyKeys();
  if (migrated) {
    window.localStorage.setItem(DESIGN_PRESET_STORAGE_KEY, migrated);
    return migrated;
  }
  return DEFAULT_DESIGN_PRESET;
}

export function applyDesignPresetToDocument(preset: DesignPreset) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.design = preset;
}

export function persistDesignPreset(preset: DesignPreset) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DESIGN_PRESET_STORAGE_KEY, preset);
  applyDesignPresetToDocument(preset);
}
