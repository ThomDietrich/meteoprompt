import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the prod runner stage can ship a minimal server.
  output: "standalone",

  // Old NeoWX deep links (e.g. /neowx, /neowx/index.html) → home.
  async redirects() {
    return [
      { source: "/neowx", destination: "/", permanent: true },
      { source: "/neowx/:path*", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
