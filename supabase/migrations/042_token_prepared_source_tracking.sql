-- Track which Adventure Maker JSONB token produced a live token. This lets
-- portal travel reuse a live map while still syncing newly added prepared
-- tokens into that map without duplicating them on every visit.

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS source_prepared_token_id TEXT;

CREATE INDEX IF NOT EXISTS tokens_source_prepared_token_idx
  ON tokens(map_id, source_prepared_token_id)
  WHERE source_prepared_token_id IS NOT NULL;

COMMENT ON COLUMN tokens.source_prepared_token_id IS
  'PreparedMapToken.id from prepared_maps.tokens JSONB; used to sync prepared scene tokens into reused live maps.';
