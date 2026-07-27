// @kickoff/data public surface.
//
// TRANSITIONAL: the markets app currently imports these client functions
// directly (in-process). Build-order step 5 replaces that with the /v1 HTTP
// consumer API + webhooks, after which the app's only compile-time dependency
// is @kickoff/schema and this barrel serves the service's own worker/routes.
export * from "./apiFootball";
export {
  isMockMode as fdorgIsMockMode,
  getEplMatches,
  fixtureKey,
  teamSlug,
  type FdMatch,
} from "./footballDataOrg";
export * from "./scoring";
export * from "./backtest";
export * from "./identity";
export * from "./archive";
export * from "./budget";
export {
  afStatus,
  afEventType,
  normalizeAfFixture,
  normalizeAfEvents,
  normalizeAfPlayers,
} from "./normalize/apiFootball";
export { fdStatus, normalizeFdMatch } from "./normalize/footballDataOrg";
