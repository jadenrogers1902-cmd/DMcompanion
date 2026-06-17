-- Reduce automatic player travel reveal radius from 15 ft to 7 ft.
-- This updates the move_token RPC even if migration 033 was already applied.

DO $$
DECLARE
  fn TEXT;
BEGIN
  SELECT pg_get_functiondef('move_token(uuid,double precision,double precision)'::regprocedure)
    INTO fn;

  fn := REPLACE(
    fn,
    'reveal_radius := (15.0 / scale) * gsize;',
    'reveal_radius := (7.0 / scale) * gsize;'
  );

  EXECUTE fn;
END $$;
