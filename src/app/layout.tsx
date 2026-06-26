import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "wetter-chat",
  description: "Dashboard für Wetter-Zeitreihen aus InfluxDB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
