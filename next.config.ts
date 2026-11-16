import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // why: Playwright runs its own dev server next to the developer's; Next allows one per distDir
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
