// Structured logging — every failure spot in the service speaks through
// here so Railway's log view is greppable and machine-parseable.
//
// Format: pretty lines locally (KICKOFF_DATA_LOG_FORMAT unset/"pretty"),
// single-line JSON in production ("json") for Railway's filter bar.
// Every entry carries: ts, level, component, msg, plus structured fields.
//
//   log.warn("apiFootball", "rate limited", { status: 429, endpoint });
//   pretty → 02:14:07 WARN  [apiFootball] rate limited status=429 endpoint=/fixtures
//   json   → {"ts":"...","level":"warn","component":"apiFootball","msg":"rate limited","status":429,...}
//
// Levels: debug < info < warn < error. KICKOFF_DATA_LOG_LEVEL gates output
// (default info). error/warn → stderr, rest → stdout (Railway colors them).
//
// Troubleshooting map — what to grep when something's wrong:
//   worker dead?          component=worker msg="tick"     (heartbeat, 1/tick)
//   rate limited?         msg="rate limited" | "budget exhausted"
//   source unreachable?   msg="fetch failed" | "http error"
//   settlement stuck?     component=settlement (votes, quorum, stall, freeze)
//   webhooks failing?     component=webhook msg="delivery failed"
//   app can't reach /v1?  component=api (every request logged w/ status+ms)

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): Level {
  const l = process.env.KICKOFF_DATA_LOG_LEVEL as Level | undefined;
  return l && l in ORDER ? l : "info";
}

function isJson(): boolean {
  const f = process.env.KICKOFF_DATA_LOG_FORMAT;
  return f === "json" || (!f && process.env.RAILWAY_ENVIRONMENT !== undefined);
}

export type LogFields = Record<string, unknown>;

function emit(level: Level, component: string, msg: string, fields: LogFields = {}): void {
  if (ORDER[level] < ORDER[minLevel()]) return;
  const out = level === "warn" || level === "error" ? process.stderr : process.stdout;
  const ts = new Date().toISOString();

  if (isJson()) {
    // Errors serialize to {} by default — flatten them first.
    const flat: LogFields = {};
    for (const [k, v] of Object.entries(fields)) {
      flat[k] = v instanceof Error ? `${v.message}` : v;
    }
    out.write(JSON.stringify({ ts, level, component, msg, ...flat }) + "\n");
    return;
  }

  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${v instanceof Error ? v.message : typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" ");
  out.write(`${ts.slice(11, 19)} ${level.toUpperCase().padEnd(5)} [${component}] ${msg}${kv ? " " + kv : ""}\n`);
}

export const log = {
  debug: (component: string, msg: string, fields?: LogFields) => emit("debug", component, msg, fields),
  info: (component: string, msg: string, fields?: LogFields) => emit("info", component, msg, fields),
  warn: (component: string, msg: string, fields?: LogFields) => emit("warn", component, msg, fields),
  error: (component: string, msg: string, fields?: LogFields) => emit("error", component, msg, fields),
};
