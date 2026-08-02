// @kickoff/data public surface — the service's OWN worker/routes/tests.
//
// The markets app no longer imports this package (build step 5 done): it
// consumes the /v1 HTTP consumer API via src/lib/dataService.ts, and its
// only compile-time dependency is @kickoff/schema.
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
export * from "./flashscore";
export {
  parseMinute,
  fsPeriod,
  fsStatus,
  fsEventType,
  isEplLive,
  isEplExtractor,
  normalizeFsLiveFixture,
  normalizeFsMatchState,
  normalizeFsEvents,
  normalizeFsStats,
  normalizeFsExtractorMatch,
  s4Status,
} from "./normalize/flashscore";
export {
  isMockMode as fplIsMockMode,
  getBootstrap,
  getEventLive,
  getFplFixtures,
  type FplBootstrap,
  type FplLiveElement,
  type FplFixture,
} from "./fpl";
export {
  fplPosition,
  fplTeamSlugs,
  normalizeFplGameweeks,
  normalizeFplPlayers,
  normalizeFplFixtures,
  normalizeFplLive,
} from "./normalize/fpl";
export { gwStage, crossCheckS1, buildOutcome, type GwStage } from "./fplSettlement";
