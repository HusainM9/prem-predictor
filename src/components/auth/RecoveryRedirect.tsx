"use client";

import { useEffect } from "react";

export function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const recoveryType = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (
      recoveryType === "recovery" &&
      accessToken &&
      refreshToken &&
      window.location.pathname !== "/reset-password"
    ) {
      window.location.replace(`/reset-password${window.location.hash}`);
    }
  }, []);

  return null;
}

