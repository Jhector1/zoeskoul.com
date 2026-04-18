import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  experimental: {
    externalDir: true,
  },

  transpilePackages: ["@zoeskoul/pty-auth", "@zoeskoul/code-contracts"],

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