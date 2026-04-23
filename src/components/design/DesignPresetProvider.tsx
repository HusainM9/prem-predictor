"use client";

import { useEffect, type ReactNode } from "react";
import { applyDesignPresetToDocument, readStoredDesignPreset } from "@/lib/design-preset";

export function DesignPresetProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const sync = () => applyDesignPresetToDocument(readStoredDesignPreset());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return <>{children}</>;
}
