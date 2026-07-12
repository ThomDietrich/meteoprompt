"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "App installieren" affordance (spec-14), shown in the header only when the app
 * is actually installable and not already installed. On Android/Desktop-Chrome it
 * captures `beforeinstallprompt` and triggers the native install dialog; on iOS
 * Safari (which has no such event) it shows the "Teilen → Zum Home-Bildschirm"
 * hint. Renders nothing otherwise, so the header layout is untouched.
 *
 * The `beforeinstallprompt` event can fire BEFORE React hydrates this effect — a
 * small head script (see layout.tsx) stashes it on `window.__bip` and dispatches
 * `bip-available`, so we adopt an early event instead of losing it (the classic
 * install-button race).
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type WindowWithBip = Window & { __bip?: BeforeInstallPromptEvent | null };

const PILL =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3v9m0 0 3.25-3.25M10 12 6.75 8.75M4 15.5h12" />
    </svg>
  );
}

export function InstallButton({ appName = "MeteoPrompt" }: { appName?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosCapable, setIosCapable] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) {
      setHidden(true);
      return;
    }

    const w = window as WindowWithBip;
    const adopt = () => {
      if (w.__bip) setDeferred(w.__bip);
    };
    adopt(); // an event captured pre-hydration by the head script

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      w.__bip = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      w.__bip = null;
      setHidden(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("bip-available", adopt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS/iPadOS Safari: no beforeinstallprompt → offer the manual hint instead.
    const ua = nav.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1); // iPadOS 13+ reports MacIntel
    const isSafari = /safari/i.test(ua) && !/crios|fxios|android|chrome/i.test(ua);
    if (isIOS && isSafari) setIosCapable(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("bip-available", adopt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Dismiss the iOS hint on Escape or an outside click (a11y).
  useEffect(() => {
    if (!showIosHint) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowIosHint(false);
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowIosHint(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [showIosHint]);

  if (hidden) return null;

  if (deferred) {
    return (
      <button
        type="button"
        className={`${PILL} ml-auto`}
        onClick={async () => {
          try {
            await deferred.prompt();
            await deferred.userChoice;
          } catch {
            /* user dismissed or prompt unavailable */
          }
          (window as WindowWithBip).__bip = null;
          setDeferred(null);
        }}
      >
        <DownloadIcon />
        Installieren
      </button>
    );
  }

  if (iosCapable) {
    return (
      <div ref={wrapRef} className="relative ml-auto">
        <button
          type="button"
          className={PILL}
          aria-expanded={showIosHint}
          onClick={() => setShowIosHint((v) => !v)}
        >
          <DownloadIcon />
          Installieren
        </button>
        {showIosHint && (
          <div
            role="dialog"
            aria-label={`${appName} installieren`}
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-black/10 bg-white p-3 text-[13px] leading-snug text-brand-ink shadow-lg"
          >
            Tippe unten in Safari auf <strong>Teilen</strong> und dann auf{" "}
            <strong>„Zum Home-Bildschirm"</strong>, um {appName} als App zu installieren.
          </div>
        )}
      </div>
    );
  }

  return null;
}
