"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const navLinks = [
  { href: "/play", label: "Play" },
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/table", label: "Table" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:border-neutral-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-lg font-bold text-foreground no-underline hover:opacity-90"
        >
          Scoreline
        </Link>

        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Main">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
                  isActive
                    ? "bg-neutral-200 text-foreground dark:bg-neutral-700"
                    : "text-foreground/80 hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {userEmail && (
            <>
              <Link
                href="/leagues"
                className={`rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
                  pathname.startsWith("/leagues")
                    ? "bg-neutral-200 text-foreground dark:bg-neutral-700"
                    : "text-foreground/80 hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
                }`}
              >
                Leagues
              </Link>
              <Link
                href="/history"
                className={`rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
                  pathname === "/history"
                    ? "bg-neutral-200 text-foreground dark:bg-neutral-700"
                    : "text-foreground/80 hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
                }`}
              >
                History
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {userEmail ? (
            <>
              <span className="max-w-[140px] truncate text-sm text-foreground/70 sm:max-w-[200px]" title={userEmail}>
                {userEmail}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/90 no-underline hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md border border-neutral-300 bg-neutral-900 px-3 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-neutral-800 dark:border-neutral-600 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
