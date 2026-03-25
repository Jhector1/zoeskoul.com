// next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
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