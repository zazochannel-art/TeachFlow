import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Keep visited pages in the client router cache for 30 s, so going back to a page
    // you just saw is instant. Every server action calls revalidatePath("/", "layout"),
    // which clears this cache, so edits still show up right away.
    staleTimes: { dynamic: 30, static: 180 },
    // Tree-shake icon imports.
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
