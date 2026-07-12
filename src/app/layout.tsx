import type { Metadata, Viewport } from "next";
import { Archivo_Black } from "next/font/google";
import Script from "next/script";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PwaRegister } from "@/components/pwa-register";
import { appName, siteName, siteTagline } from "@/lib/site";
import "./globals.css";

// Bold grotesque display font for the "MeteoPrompt" wordmark only (header +
// footer); body stays sans. Exposed as --font-wordmark, used via `.font-wordmark`.
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: ["400"], // Archivo Black ships a single (black) weight
  variable: "--font-wordmark",
  display: "swap",
});

// Render dynamically so the env-driven tagline (SITE_TAGLINE) resolves at
// runtime from the container's environment, not at build time.
export const dynamic = "force-dynamic";

// PWA/standalone chrome (spec-14): brand-blue theme colour drives the mobile
// status bar; viewport-fit cover lets the app draw under the iOS notch.
export const viewport: Viewport = {
  themeColor: "#1f5ba8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateMetadata(): Metadata {
  const name = siteName(); // on-page wordmark / window title
  const app = appName(); // installed-app / home-screen name (may differ)
  const tagline = siteTagline();
  return {
    title: `${name} – ${tagline}`,
    description: `${name} — ${tagline}. Die Zeitreihen der eigenen Wetterstation per Prompt erkunden.`,
    applicationName: app,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: app },
    icons: {
      // Must list `icon` explicitly: once metadata.icons is set, Next stops
      // auto-emitting the file-based app/icon.svg favicon (that dropped the tab
      // icon). SVG primary + PNG fallback for browsers without SVG-favicon support.
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={archivoBlack.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        {/* Capture beforeinstallprompt BEFORE hydration so the install button
            (components/install-button.tsx) can adopt it — the event may fire
            before React runs its effect (spec-14). */}
        <Script id="bip-capture" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-available'));});`}
        </Script>
        <PwaRegister />
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
