"use client"

import { useEffect, useState } from "react"
import { LandingPage } from "@/components/landing-page"
import { DashboardPage } from "@/components/dashboard-page"
import { supabase } from "@/lib/supabase/client"

/** Home: v0 landing when logged out, v0 dashboard when logged in. */
export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (authReady && !userEmail) {
      const nowIso = new Date().toISOString()
      supabase
        .from("fixtures")
        .select("gameweek")
        .eq("season", "2025/26")
        .lt("kickoff_time", nowIso)
        .order("kickoff_time", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          const gw = (data as { gameweek?: number } | null)?.gameweek
          setCurrentGameweek(gw != null && Number.isInteger(gw) ? gw : null)
        })
    }
  }, [authReady, userEmail])

  if (!authReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (userEmail) {
    return (
      <DashboardPage
        onLogout={async () => {
          await supabase.auth.signOut()
        }}
      />
    )
  }

  return <LandingPage onLogin={() => {}} currentGameweek={currentGameweek} />
}
