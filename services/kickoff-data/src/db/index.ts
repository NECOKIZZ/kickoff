import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// kickoff-data owns its OWN database (kickoff_data), separate from the
// markets app's (kickoff) — the app consumes this service over HTTP only.
const url = process.env.KICKOFF_DATA_DATABASE_URL;
if (!url) throw new Error("KICKOFF_DATA_DATABASE_URL is not set");

const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
