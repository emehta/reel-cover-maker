import type { NextConfig } from "next";

/**
 * A static site: `next build` writes plain files to `out/`, which GitHub
 * Pages serves (see .github/workflows/pages.yml). Nothing here runs on a
 * server, so there is no host to pay for.
 *
 * `PAGES_BASE_PATH` is the path the site is served under, which Pages works
 * out at build time: "/reel-cover-maker" at emehta.github.io/reel-cover-maker,
 * nothing on a domain of its own. Unset, as on a local build, it is the root.
 *
 * Pages cannot send response headers, so the security headers this site had
 * on Vercel are gone; a static page with no forms, cookies or third-party
 * scripts has little they guarded.
 */
const basePath = process.env.PAGES_BASE_PATH?.replace(/\/+$/, "") || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // This repo's CLAUDE.md is written by hand; `next dev` would otherwise write its own.
  agentRules: false,
};

export default nextConfig;
