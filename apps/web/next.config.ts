// next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const RUNNER_HTTP_BASE = process.env.RUNNER_BASE_URL?.replace(/\/+$/, "") ?? "";

const nextConfig = {
  async rewrites() {
    if (!RUNNER_HTTP_BASE) return [];
    return [
      {
        source: "/api/run/:path*",
        destination: `${RUNNER_HTTP_BASE}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },

  // keep pdfkit external so it can read its runtime files
  serverExternalPackages: ["pdfkit"],

  // ✅ moved out of experimental in Next 16.1.1
  outputFileTracingIncludes: {
    "/api/certificates/subject/pdf": ["./node_modules/pdfkit/js/data/**"],
  },
} satisfies NextConfig;

export default withNextIntl(nextConfig);