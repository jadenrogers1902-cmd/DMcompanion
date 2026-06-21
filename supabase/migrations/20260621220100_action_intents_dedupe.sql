-- Prevent duplicate *pending* action requests from the same actor for the same
-- target + action (QA Phase 6).
--
-- submitActionIntent() is a plain INSERT, so a fast double-click or a retry
-- under realtime latency could create two identical 'pending' intents. The
-- client already disables the submit button while sending, but that doesn't
-- close the race. This partial unique index makes the guarantee at the DB
-- level: at most one in-flight ('pending') request per (actor, target, action).
--
-- Scope is intentionally narrow — only 'pending'. Once the DM acts and the
-- status moves on (approved / needs_roll / resolved / denied / cancelled / …),
-- the row no longer participates, so legitimate re-requests after a resolution
-- are unaffected. NULL actor_character_id rows are treated as distinct by
-- Postgres and are not constrained (they don't occur on this path anyway).
--
-- NOTE: if the table already contains two rows that violate this predicate, the
-- index build will fail. Resolve/cancel the stale duplicate, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS action_intents_one_pending_per_actor_target
  ON action_intents (actor_character_id, target_token_id, action_type)
  WHERE status = 'pending';
