import type { Metadata } from "next";
import { Archivo_Black } from "next/font/google";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { siteTagline } from "@/lib/site";
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

export function generateMetadata(): Metadata {
  const tagline = siteTagline();
  return {
    title: `MeteoPrompt – ${tagline}`,
    description: `MeteoPrompt — ${tagline}. Die Zeitreihen der eigenen Wetterstation per Prompt erkunden.`,
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
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
