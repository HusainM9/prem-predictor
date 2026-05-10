"use client";

import { User } from "lucide-react";
import { TeamLogo } from "@/components/play/TeamLogo";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  favouriteTeam?: string | null;
  size?: number;
  className?: string;
};

export function UserAvatar({ favouriteTeam, size = 28, className }: UserAvatarProps) {
  if (favouriteTeam) {
    return <TeamLogo teamName={favouriteTeam} size={size} className={className} />;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <User size={Math.max(12, Math.round(size * 0.56))} />
    </div>
  );
}

