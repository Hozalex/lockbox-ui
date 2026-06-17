import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Build version shown in the UI corner. Defaults to the package.json version;
// override with NEXT_PUBLIC_BUILD_VERSION (e.g. a git tag/sha) at build time.
const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};
const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || pkg.version;

// CSP is now set per-request in src/proxy.ts with a unique nonce.
// Static headers below cover everything except CSP.
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
