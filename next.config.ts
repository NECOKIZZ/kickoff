import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw .ts — Next compiles them in-place.
  transpilePackages: ["@kickoff/engine", "@kickoff/schema", "@kickoff/data"],
  // pnpm workspace confuses Turbopack's root inference on Vercel (it picks
  // app/ and can't resolve next from there) — pin it to this directory.
  turbopack: {
    root: __dirname,
  },
  // Cloud Shell web preview proxies the dev server from a *.cloudshell.dev
  // host — allow it so HMR/dev assets aren't blocked (choppy-loading fix).
  // NOTE: a single * only matches one DNS label, so spell out the deep host.
  allowedDevOrigins: [
    "*.cloudshell.dev",
    "*.cs-europe-west1-xedi.cloudshell.dev",
    "3123-cs-525083003279-default.cs-europe-west1-xedi.cloudshell.dev",
  ],
};

export default nextConfig;
