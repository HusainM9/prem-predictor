"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { formatOAuthInitError } from "@/lib/auth-helpers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotMsg, setForgotMsg] = useState<string | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotCooldownUntil, setForgotCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const forgotCooldownSeconds = Math.max(0, Math.ceil((forgotCooldownUntil - nowMs) / 1000))
  const forgotDisabled = forgotLoading || forgotCooldownSeconds > 0

  useEffect(() => {
    if (forgotCooldownSeconds <= 0) return
    const t = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(t)
  }, [forgotCooldownSeconds])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)

    let email = identifier.trim().toLowerCase()
    if (email && !email.includes("@")) {
      try {
        const resolveRes = await fetch("/api/auth/resolve-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier.trim() }),
        })
        if (resolveRes.ok) {
          const data = await resolveRes.json()
          if (typeof data.email === "string" && data.email.length > 0) {
            email = data.email
          }
        }
      } catch {
      }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) return setMsg(error.message)

    router.push("/")
  }

  async function onGoogleSignIn() {
    setMsg(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) setMsg(formatOAuthInitError(error))
  }

  async function onForgotPassword() {
    setForgotMsg(null)
    const email = forgotEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setForgotMsg("Enter a valid email address.")
      return
    }
    const now = Date.now()
    if (now < forgotCooldownUntil) {
      return
    }
    // Start client cooldown from first click
    setForgotCooldownUntil(now + 30_000)
    setForgotLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 0)
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          const candidate = Date.now() + retryAfter * 1000
          setForgotCooldownUntil((prev) => (candidate > prev ? candidate : prev))
        }
        setForgotMsg(data.error ?? "Unable to send reset email right now.")
      } else {
        setForgotMsg(data.message ?? "If an account exists, we sent a reset link.")
      }
    } catch {
      setForgotMsg("Unable to send reset email right now.")
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-[400px] border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-foreground">
            Log in
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in with your email or display name to access your leagues and predictions.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-foreground">
                Email or display name
              </Label>
              <Input
                id="identifier"
                type="text"
                placeholder="you@example.com or your display name"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-background border-border"
              />
              <div className="pt-1">
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    const emailLike = identifier.includes("@") ? identifier.trim() : ""
                    if (emailLike && !forgotEmail) setForgotEmail(emailLike)
                    setShowForgot((v) => !v)
                    setForgotMsg(null)
                  }}
                >
                  Forgot password?
                </button>
              </div>
              {showForgot && (
                <div className="mt-2 rounded-md border border-border bg-background p-3">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-foreground">
                      Reset email
                    </Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoComplete="email"
                      className="bg-background border-border"
                    />
                    <Button type="button" size="sm" disabled={forgotDisabled} onClick={onForgotPassword}>
                      {forgotLoading
                        ? "Sending…"
                        : forgotCooldownSeconds > 0
                          ? `Try again in ${forgotCooldownSeconds}s`
                          : "Send reset link"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      One request every 30 seconds. 5 Requests per hour.
                    </p>
                    {forgotMsg && (
                      <p className="text-xs text-muted-foreground" role="status">
                        {forgotMsg}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {msg && (
              <p className="text-sm text-destructive" role="alert">
                {msg}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Log in"}
            </Button>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={() => void onGoogleSignIn()}
            >
              Continue with Google
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Get started
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}
