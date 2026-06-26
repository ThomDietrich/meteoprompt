import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the prod runner stage can ship a minimal server.
  output: "standalone",
};

export default nextConfig;
