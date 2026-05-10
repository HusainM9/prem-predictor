"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

let crestsCache: Record<string, string> | null = null;
let crestsPromise: Promise<Record<string, string>> | null = null;

function fetchCrests(): Promise<Record<string, string>> {
  if (crestsCache) return Promise.resolve(crestsCache);
  if (crestsPromise) return crestsPromise;
  crestsPromise = fetch("/api/team-crests")
    .then((r) => r.json())
    .then((d) => {
      const map = (d.crests ?? {}) as Record<string, string>;
      crestsCache = map;
      return map;
    })
    .catch(() => {
      crestsCache = {};
      return {};
    });
  return crestsPromise;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

interface TeamLogoProps {
  teamName: string;
  className?: string;
  size?: number;
}


export function TeamLogo({ teamName, className, size = 36 }: TeamLogoProps) {
  const [crests, setCrests] = useState<Record<string, string>>(crestsCache ?? {});
  const crestUrl = crests[teamName];
  const initials = getInitials(teamName);

  useEffect(() => {
    if (crestsCache) {
      queueMicrotask(() => setCrests(crestsCache ?? {}));
      return;
    }
    fetchCrests().then(setCrests);
  }, []);

  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 object-contain", className)}
        style={{ width: size, height: size, verticalAlign: "middle" }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground font-bold",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials}
    </div>
  );
}
