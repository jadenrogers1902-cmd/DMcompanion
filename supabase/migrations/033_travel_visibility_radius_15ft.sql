-- Reduce automatic player travel reveal radius from 30 ft to 15 ft.
-- This updates the move_token RPC even if migration 032 was already applied.

DO $$
DECLARE
  fn TEXT;
BEGIN
  SELECT pg_get_functiondef('move_token(uuid,double precision,double precision)'::regprocedure)
    INTO fn;

  fn := REPLACE(
    fn,
    'reveal_radius := (30.0 / scale) * gsize;',
    'reveal_radius := (15.0 / scale) * gsize;'
  );

  EXECUTE fn;
END $$;
