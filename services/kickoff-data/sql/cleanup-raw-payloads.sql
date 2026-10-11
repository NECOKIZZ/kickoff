-- One-off cleanup for raw_payloads (run in the Supabase SQL editor).
--
-- Deletes every archived payload nothing references, keeping settlement-vote
-- evidence, then VACUUM FULL to actually return the space — a plain DELETE
-- does not shrink the reported database size.
--
-- Do NOT use TRUNCATE ... CASCADE: it would wipe the tables that reference
-- raw_payloads. VACUUM FULL locks the table briefly; the worker's archive
-- writes wait (or fail and are swallowed) for that moment, which is harmless.
-- Run the two statements separately if your editor wraps them in a
-- transaction (VACUUM cannot run inside one).

DELETE FROM raw_payloads r
WHERE r.endpoint NOT LIKE 'settlement-vote:%'
  AND NOT EXISTS (SELECT 1 FROM match_events x WHERE x.raw_payload_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM player_match_stats x WHERE x.raw_payload_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM fpl_player_points x WHERE x.raw_payload_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM player_points_settlements x WHERE x.raw_payload_id = r.id);

VACUUM FULL raw_payloads;

-- Check: SELECT pg_size_pretty(pg_total_relation_size('raw_payloads'));
