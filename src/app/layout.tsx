import type { Metadata } from "next";
import { Fraunces } from "next/font/google";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

// Refined serif display font for the masthead title only (body stays sans).
// Exposed as the CSS variable --font-display; used via the `font-display` class.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wetterchatty – Das interaktive Wetterportal für Nurzen",
  description:
    "Das interaktive Wetterportal für Nurzen — Dashboard und Chat für die Zeitreihen der eigenen Wetterstation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={fraunces.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
