"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type DesignPreset,
  DESIGN_PRESET_OPTIONS,
  persistDesignPreset,
  readStoredDesignPreset,
} from "@/lib/design-preset";

export function DesignPresetSwitcher() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [preset, setPreset] = useState<DesignPreset>("emerald");

  useEffect(() => {
    setMounted(true);
    setPreset(readStoredDesignPreset());
  }, []);

  useEffect(() => {
    if (!mounted || resolvedTheme !== "dark") return;
    setPreset(readStoredDesignPreset());
  }, [mounted, resolvedTheme]);

  if (!mounted || resolvedTheme !== "dark") return null;

  return (
    <Select
      value={preset}
      onValueChange={(v) => {
        if (!DESIGN_PRESET_OPTIONS.some((o) => o.value === v)) return;
        const next = v as DesignPreset;
        setPreset(next);
        persistDesignPreset(next);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-8 w-[min(100vw-9rem,11.5rem)] max-sm:h-8 max-sm:px-2 max-sm:text-[11px] sm:w-48"
        aria-label="Dark mode design preset"
        title="Try different dark themes"
      >
        <Sparkles className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <SelectValue placeholder="Design" />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[12rem]">
        {DESIGN_PRESET_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} title={o.hint}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
