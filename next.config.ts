import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw .ts — Next compiles them in-place.
  transpilePackages: ["@kickoff/engine", "@kickoff/schema", "@kickoff/data"],
  // Cloud Shell web preview proxies the dev server from a *.cloudshell.dev
  // host — allow it so HMR/dev assets aren't blocked (choppy-loading fix).
  allowedDevOrigins: ["*.cloudshell.dev"],
};

export default nextConfig;
