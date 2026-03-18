"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setHasRecoverySession(!!data.session);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(!!session);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    await supabase.auth.signOut();
    setCompleted(true);
    setMsg("Password updated. You can now log in with your new password.");
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-[420px] border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-foreground">
            Reset password
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Set a new password for your account.
          </CardDescription>
        </CardHeader>

        {checking ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Checking reset link…</p>
          </CardContent>
        ) : completed ? (
          <>
            <CardContent className="space-y-2">
              <p className="text-sm text-foreground">
                Password updated successfully.
              </p>
              <p className="text-sm text-muted-foreground">
                Use your new password the next time you log in.
              </p>
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </CardFooter>
          </>
        ) : hasRecoverySession ? (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-foreground">
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground">
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
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
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </CardFooter>
          </form>
        ) : (
          <>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or expired. Request a new one from the login page.
              </p>
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </main>
  );
}

