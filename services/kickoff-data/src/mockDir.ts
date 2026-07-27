// Locates the recorded-payload directory for mock mode regardless of which
// workspace package is the process cwd (repo root for the Next app,
// services/kickoff-data for the service's own tests/worker).
import { existsSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

export function fixturesDir(): string {
  if (cached) return cached;
  const candidates = [
    path.join(process.cwd(), "fixtures"), // cwd = services/kickoff-data
    path.join(process.cwd(), "services/kickoff-data/fixtures"), // cwd = repo root
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return (cached = dir);
  }
  throw new Error(
    `kickoff-data: recorded fixtures dir not found (tried ${candidates.join(", ")})`,
  );
}
