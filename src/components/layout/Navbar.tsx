"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Zap, User, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

/**private: true = only when logged in. */
const navLinks = [
  { href: "/play", label: "Play", private: false },
  { href: "/leagues", label: "Leagues", private: true },
  { href: "/history", label: "History", private: true },
  { href: "/leaderboard", label: "Leaderboard", private: false },
  { href: "/matches", label: "Matches", private: false },
  { href: "/table", label: "Table", private: false },
] as const

function NavLink({
  href,
  label,
  isActive,
}: {
  href: string
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-md py-1.5 text-sm font-medium no-underline transition-colors max-[420px]:px-1.5 max-[420px]:py-1 max-[420px]:text-[11px] max-sm:px-2 max-sm:py-1.5 max-sm:text-xs sm:px-3 sm:py-2 ${
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [logoError, setLogoError] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/")
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const showCustomLogo = !logoError

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative mx-auto flex min-h-14 max-w-[1100px] flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-2 sm:h-14 sm:flex-nowrap sm:gap-4 sm:px-4 sm:py-0 md:px-6">
        {/* Logo + Scoreline; on small screens nav sits next to logo */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 max-[420px]:min-w-0 max-[420px]:flex-1 md:flex-initial">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="Scoreline home">
            {showCustomLogo ? (
              <img
                src="/logo3.jpg"
                alt=""
                style={{ borderRadius: "20%", width: "40px", height: "40px" }}
                className="size-9 object-contain max-[420px]:size-8 sm:size-10 md:size-14"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex size-6 items-center justify-center rounded-md bg-primary max-[420px]:size-6 sm:size-8">
                <Zap className="size-3 text-primary-foreground max-[420px]:size-3 sm:size-4" />
              </div>
            )}
            <span className="hidden text-base font-bold tracking-tight text-foreground sm:inline sm:text-lg">
              Scoreline
            </span>
          </Link>
          {/* Next to logo on small; on md+ absolutely centered in the bar */}
          <nav className="flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto py-1 max-[420px]:gap-0.5 max-[420px]:overflow-x-auto sm:gap-2 sm:overflow-visible md:absolute md:left-1/2 md:top-1/2 md:z-10 md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-visible" aria-label="Main">
            {navLinks
              .filter((link) => !link.private || userEmail)
              .map(({ href, label }) => (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  isActive={pathname === href || pathname.startsWith(href + "/")}
                />
              ))}
          </nav>
        </div>

        <div className="flex w-full shrink-0 items-center justify-end gap-1 max-[420px]:w-full sm:w-auto sm:gap-2">
          {userEmail ? (
            <>
              <Link
                href="/profile"
                className="flex size-9 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground max-sm:size-8"
                title="Profile"
                aria-label="Profile"
              >
                <User className="size-5 max-sm:size-4" />
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 max-sm:size-8"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="size-4 max-sm:size-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="max-sm:text-xs max-sm:px-2 max-sm:py-1.5">
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild className="max-sm:text-xs max-sm:px-2 max-sm:py-1.5">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
