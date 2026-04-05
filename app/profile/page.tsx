"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase/client"
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@/lib/name-validation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

export default function ProfilePage() {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [canChangeDisplayName, setCanChangeDisplayName] = useState(true)
  const [nextDisplayNameChangeAt, setNextDisplayNameChangeAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [predictionsPublicBeforeLock, setPredictionsPublicBeforeLock] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setMounted(true))
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/login")
        return
      }
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = await res.json()
      setEmail(data.email ?? null)
      setDisplayName(data.display_name ?? "")
      setCanChangeDisplayName(data.can_change_display_name ?? true)
      setNextDisplayNameChangeAt(data.next_display_name_change_at ?? null)
      setPredictionsPublicBeforeLock(data.predictions_public_before_lock === true)
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!canChangeDisplayName && displayName) {
      setMsg("You can only change your display name once every 60 days.")
      return
    }
    const trimmed = displayName.trim()
    const validation = validateDisplayName(trimmed)
    if (!validation.valid) {
      setMsg(validation.error ?? "Invalid name")
      return
    }
    setSaving(true)
    setMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setSaving(false)
      return
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ display_name: trimmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMsg(data.error ?? "Failed to save")
      if (res.status === 429 && data.next_display_name_change_at) {
        setNextDisplayNameChangeAt(data.next_display_name_change_at)
        setCanChangeDisplayName(false)
      }
      return
    }
    setMsg(null)
    setCanChangeDisplayName(false)
    if (data.next_display_name_change_at) setNextDisplayNameChangeAt(data.next_display_name_change_at)
  }

  function formatNextChangeDate(iso: string | null) {
    if (!iso) return null
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
    } catch {
      return iso.slice(0, 10)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    if (newPassword.length < 6) {
      setPasswordMsg("Password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords do not match")
      return
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) {
      setPasswordMsg(error.message)
      return
    }
    setNewPassword("")
    setConfirmPassword("")
    setChangePasswordOpen(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace("/")
  }

  async function handlePredictionsPrivacyChange(checked: boolean) {
    setPrefsMsg(null)
    setPrefsSaving(true)
    const previous = predictionsPublicBeforeLock
    setPredictionsPublicBeforeLock(checked)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setPrefsSaving(false)
      setPredictionsPublicBeforeLock(previous)
      return
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ predictions_public_before_lock: checked }),
    })
    const data = await res.json().catch(() => ({}))
    setPrefsSaving(false)
    if (!res.ok) {
      setPredictionsPublicBeforeLock(previous)
      setPrefsMsg(typeof data.error === "string" ? data.error : "Could not update setting.")
      return
    }
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-[600px]">
        <h1 className="text-2xl font-bold text-foreground mb-6">Profile</h1>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Your account details. Display name is shown on leaderboards.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSaveProfile}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="How you appear on leaderboards"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={DISPLAY_NAME_MAX_LENGTH}
                      disabled={!canChangeDisplayName}
                      className="bg-background border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Max {DISPLAY_NAME_MAX_LENGTH} characters.
                      {!canChangeDisplayName && nextDisplayNameChangeAt && (
                        <span className="block mt-1">
                          Next change allowed after {formatNextChangeDate(nextDisplayNameChangeAt)} (once every 60 days).
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email ?? ""}
                      readOnly
                      disabled
                      className="bg-muted/50 border-border text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                  </div>
                  {msg && <p className="text-sm text-destructive">{msg}</p>}
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={saving || !canChangeDisplayName}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Preferences / Accessibility</CardTitle>
                <CardDescription>Appearance and prediction visibility.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="pred-privacy" className="text-base">
                      Public predictions before odds lock
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When off (default), others cannot see your predicted scores until odds are locked or the match has
                      kicked off. You always see your own picks on Play. Turn on to let others see your line before then.
                    </p>
                    {prefsMsg && (
                      <p className="text-xs text-destructive" role="alert">
                        {prefsMsg}
                      </p>
                    )}
                  </div>
                  <Switch
                    id="pred-privacy"
                    checked={predictionsPublicBeforeLock}
                    disabled={prefsSaving}
                    onCheckedChange={(v) => void handlePredictionsPrivacyChange(v)}
                    aria-label="Public predictions before odds lock"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  {mounted && (
                    <Select value={theme ?? "dark"} onValueChange={(v) => setTheme(v)}>
                      <SelectTrigger className="w-full max-w-[200px]">
                        <SelectValue placeholder="Theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Current: {mounted ? (resolvedTheme ?? theme ?? "dark") : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Password and session.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="block mb-2">Password</Label>
                  <Button variant="outline" onClick={() => setChangePasswordOpen(true)}>
                    Change password
                  </Button>
                </div>
                <div>
                  <Button variant="outline" onClick={handleLogout}>
                    Log out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Enter your new password. You will stay signed in.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
              />
            </div>
            {passwordMsg && <p className="text-sm text-destructive">{passwordMsg}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
