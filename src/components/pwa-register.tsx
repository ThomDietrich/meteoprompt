"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (spec-14) — ONLY in production. In development
 * a cache-first SW would serve stale Turbopack bundles (a known Docker-dev
 * gotcha), so there we actively unregister any leftover SW instead. Renders
 * nothing; mounted once in the root layout.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    // Register after load so it never competes with first-paint resources.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
