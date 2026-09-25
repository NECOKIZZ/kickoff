// Locates the recorded-payload directory for mock mode regardless of which
// workspace package is the process cwd (repo root for the Next app,
// services/kickoff-data for the service's own tests/worker).
import { existsSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

export function fixturesDir(): string {
  // Backstop for KICKOFF_DATA_NO_MOCKS (see sources.ts): read inline, not
  // imported, since sources.ts imports every client that imports this file.
  const noMocks = process.env.KICKOFF_DATA_NO_MOCKS;
  if (noMocks === "1" || noMocks === "true")
    throw new Error("kickoff-data: mock payloads are disabled (KICKOFF_DATA_NO_MOCKS), set the source's key");
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
