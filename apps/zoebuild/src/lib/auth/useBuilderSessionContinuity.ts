"use client";

import { useEffect, useState } from "react";
import { isAppSessionResponse, type AppSessionResponse } from "@zoeskoul/api-contracts";

export const SESSION_RENEW_INTERVAL_MS = 5 * 60 * 1000;
export const ZOEBUILD_SESSION_EXPIRED_EVENT = "zoebuild:session-expired";
export const ZOEBUILD_SESSION_RENEWED_EVENT = "zoebuild:session-renewed";

/** Browser never receives the bearer token; Web owns the revocable Redis lease.
 * No redirect/reload on transient failure or actual expiry: authorization stays
 * on the server, and the user controls a fresh handoff if the lease is gone.
 */
export function useBuilderSessionContinuity(): AppSessionResponse | null {
  const [verifiedSession, setVerifiedSession] = useState<AppSessionResponse | null>(null);
  useEffect(() => {
    // Authentication failures are terminal until the user explicitly retries.
    // Do not fire background renewal 401s from the public handoff error page.
    if (window.location.pathname === "/auth/handoff/error") return;
    let mounted = true;
    let inFlight = false;
    let expiredConfirmed = false;
    let nextRetryAt = 0;
    async function renew() {
      // Do not continuously re-POST on every focus while Web/Redis is down.
      if (document.visibilityState === "hidden" || inFlight || expiredConfirmed || Date.now() < nextRetryAt) return;
      inFlight = true;
      try {
        const response = await fetch("/api/auth/handoff/renew", {
          method: "POST", credentials: "same-origin", cache: "no-store",
        });
        if (!mounted) return;
        if (response.status === 401) {
          expiredConfirmed = true;
          setVerifiedSession({ authenticated: false, user: null, roles: [], capabilities: [] });
          window.dispatchEvent(new Event(ZOEBUILD_SESSION_EXPIRED_EVENT));
        } else if (response.ok) {
          nextRetryAt = 0;
          const payload: unknown = await response.json();
          if (mounted && isAppSessionResponse(payload) && payload.authenticated) {
            setVerifiedSession(payload);
            window.dispatchEvent(new Event(ZOEBUILD_SESSION_RENEWED_EVENT));
          }
        }
        else {
          // Server outage or timeout: back off, keep server-side authorization in charge.
          nextRetryAt = Date.now() + 60_000;
        }
        // On timeout/503/network failure leave last confirmed session state
        // untouched; never impersonate a legitimate logout due to an outage.
      } catch { nextRetryAt = Date.now() + 60_000; }
      finally { inFlight = false; }
    }
    const onFocus = () => { void renew(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void renew(); };
    const tick = window.setInterval(onFocus, SESSION_RENEW_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void renew();
    return () => {
      mounted = false;
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return verifiedSession;
}
