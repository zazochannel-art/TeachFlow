import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Basic security headers on every page: no framing by other sites (clickjacking), no MIME
  // sniffing, a strict referrer, and camera/microphone/screen only for TeachFlow itself (lessons).
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
      ]
    }];
  },
  // The PDF invoices embed these fonts (Romanian and Russian letters); they are read from disk at
  // runtime, so they must be copied into the server functions that build invoices.
  outputFileTracingIncludes: {
    "/invoices/*": ["./src/lib/invoices/fonts/*.ttf"],
    "/payments": ["./src/lib/invoices/fonts/*.ttf"]
  },
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
