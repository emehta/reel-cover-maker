import type { NextConfig } from "next";

/** The same baseline headers as the site it is played on (eshaanm.net). */
const nextConfig: NextConfig = {
  // This repo's CLAUDE.md is written by hand; `next dev` would otherwise write its own.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
