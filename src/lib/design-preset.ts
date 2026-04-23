export const DESIGN_PRESET_STORAGE_KEY = "scoreline-design-preset-v1";

/** Visual preset for dark mode (tokens + optional backdrop). Light mode unchanged. */
export type DesignPreset = "emerald" | "pl-ribbons-blue" | "aurora";

export const DEFAULT_DESIGN_PRESET: DesignPreset = "emerald";

export const DESIGN_PRESET_OPTIONS: { value: DesignPreset; label: string; hint: string }[] = [
  { value: "emerald", label: "Emerald pitch", hint: "Original green-on-charcoal" },
  { value: "pl-ribbons-blue", label: "PL ribbons (blue)", hint: "Graphic backdrop + purple UI" },
  { value: "aurora", label: "Aurora mesh", hint: "CSS-only animated colour wash" },
];

export function isDesignPreset(value: string | null): value is DesignPreset {
  return value === "emerald" || value === "pl-ribbons-blue" || value === "aurora";
}

/** Map removed presets to the closest remaining look. */
function normalizeRemovedPreset(raw: string | null): DesignPreset | null {
  if (raw === "obsidian" || raw === "royal") return "emerald";
  if (raw === "pl-ribbons-magenta") return "pl-ribbons-blue";
  return null;
}

function migrateLegacyKeys(): DesignPreset | null {
  if (typeof window === "undefined") return null;
  const v2 = window.localStorage.getItem("scoreline-dark-look-v1");
  if (v2 === "classic") return "emerald";
  if (v2 === "pl-blue") return "pl-ribbons-blue";
  if (v2 === "pl-magenta") return "pl-ribbons-blue";
  const v1 = window.localStorage.getItem("scoreline-palette-v1");
  if (v1 === "classic") return "emerald";
  if (v1 === "pl") return "pl-ribbons-blue";
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
