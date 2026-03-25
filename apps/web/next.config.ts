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

  serverExternalPackages: ["pdfkit"],

  outputFileTracingIncludes: {
    "/api/certificates/subject/pdf": ["./node_modules/pdfkit/js/data/**"],
  },
} satisfies NextConfig;

export default withNextIntl(nextConfig);