import type { NextConfig } from "next";
import { csvMaxBytes } from "./src/csv-limits";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // why: Playwright runs its own dev server next to the developer's; Next allows one per distDir
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    serverActions: { bodySizeLimit: csvMaxBytes + 64 * 1024 },
  },
};

export default nextConfig;
