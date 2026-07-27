import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw .ts — Next compiles them in-place.
  transpilePackages: ["@kickoff/engine", "@kickoff/schema", "@kickoff/data"],
};

export default nextConfig;
