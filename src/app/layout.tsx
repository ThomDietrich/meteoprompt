import type { Metadata } from "next";
import { Archivo_Black } from "next/font/google";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

// Bold grotesque display font for the "MeteoPrompt" wordmark only (header +
// footer); body stays sans. Exposed as --font-wordmark, used via `.font-wordmark`.
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: ["400"], // Archivo Black ships a single (black) weight
  variable: "--font-wordmark",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MeteoPrompt – Das interaktive Wetterportal für Nurzen",
  description:
    "Das interaktive Wetterportal für Nurzen — Dashboard und Chat für die Zeitreihen der eigenen Wetterstation",
};

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
