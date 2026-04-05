"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { formatOAuthInitError } from "@/lib/auth-helpers"
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@/lib/name-validation"
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

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [pendingEmail, setPendingEmail] = useState("")
  const [pendingPassword, setPendingPassword] = useState("")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = displayName.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const validation = validateDisplayName(trimmed)
    if (!validation.valid) {
      setMsg(validation.error ?? "Invalid display name")
      return
    }
    if (!normalizedEmail) {
      setMsg("Email is required")
      return
    }
    setLoading(true)
    setMsg(null)

    // Pre-check so users get clear guidance before we attempt sign up.
    try {
      const checkRes = await fetch("/api/auth/signup-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, displayName: trimmed }),
      })
      if (checkRes.ok) {
        const check = await checkRes.json()
        if (check.emailExists || check.displayNameTaken) {
          const parts: string[] = []
          if (check.emailExists) parts.push("This email already has an account.")
          if (check.displayNameTaken) parts.push("This display name is already taken.")
          parts.push("Try logging in or use different details.")
          setMsg(parts.join(" "))
          setLoading(false)
          return
        }
      }
    } catch {
      // Non-blocking: if this check fails, continue with sign-up attempt.
    }

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: trimmed },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    setLoading(false)

    if (error) {
      const lower = error.message.toLowerCase()
      if (lower.includes("already registered") || lower.includes("already exists")) {
        return setMsg("This email already has an account. Try logging in instead.")
      }
      return setMsg(error.message)
    }

    setPendingEmail(normalizedEmail)
    setPendingPassword(password)
    setAwaitingConfirmation(true)
    setMsg("Check your inbox and confirm your email, then click the button below to log in.")
  }

  async function onConfirmedLogin() {
    if (!pendingEmail || !pendingPassword) return
    setLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: pendingEmail,
      password: pendingPassword,
    })
    setLoading(false)
    if (error) {
      setMsg(
        error.message.toLowerCase().includes("confirm")
          ? "Email not confirmed yet. Confirm it first, then try again."
          : error.message
      )
      return
    }
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

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-[400px] border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-foreground">
            Get started
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Create an account to join leagues and make predictions.
          </CardDescription>
        </CardHeader>
        {awaitingConfirmation ? (
          <>
            <CardContent className="space-y-4">
              <p className="text-sm text-foreground">
                We sent a confirmation email to <strong>{pendingEmail}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Confirm your email, then click the button below to log in automatically.
              </p>
              {msg && (
                <p className="text-sm text-muted-foreground" role="status">
                  {msg}
                </p>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-6">
              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={loading}
                onClick={onConfirmedLogin}
              >
                {loading ? "Checking confirmation…" : "I confirmed my email, log me in"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already confirmed?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Log in manually
                </Link>
              </p>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-foreground">
                  Display name
                </Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="How you'll appear on the leaderboard"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  autoComplete="username"
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Max {DISPLAY_NAME_MAX_LENGTH} characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
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
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="bg-background border-border"
                />
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
                {loading ? "Creating account…" : "Create account"}
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
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Log in
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  )
}
