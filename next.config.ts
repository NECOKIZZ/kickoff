import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw .ts — Next compiles them in-place.
  transpilePackages: ["@kickoff/engine", "@kickoff/schema", "@kickoff/data"],
  // pnpm workspace confuses Turbopack's root inference on Vercel (it picks
  // app/ and can't resolve next from there) — pin it to this directory.
  turbopack: {
    root: __dirname,
  },
  // The PnL card route reads its fonts, crests and photos from disk; public/
  // isn't bundled into serverless functions by default.
  outputFileTracingIncludes: {
    "/api/positions/[id]/card": ["./src/assets/pnl-card/**/*", "./public/brand/pnl/**/*"],
  },
  // Cloud Shell web preview proxies the dev server from a *.cloudshell.dev
  // host — allow it so HMR/dev assets aren't blocked (choppy-loading fix).
  // NOTE: a single * only matches one DNS label, so spell out the deep host.
  // OAuth discovery for MCP connectors (claude.ai, ChatGPT…) lives at fixed
  // /.well-known paths; the handlers are ordinary API routes.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/metadata/resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/metadata/resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata/server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata/server" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/metadata/server" },
    ];
  },
  // The consent page must never be framed (clickjacking the Approve button).
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "*.cloudshell.dev",
    "*.cs-europe-west1-xedi.cloudshell.dev",
    "3123-cs-525083003279-default.cs-europe-west1-xedi.cloudshell.dev",
  ],
};

export default nextConfig;
