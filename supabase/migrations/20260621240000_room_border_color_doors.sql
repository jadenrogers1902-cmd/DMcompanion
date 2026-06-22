-- Room/area authoring: a custom border colour and linked door tokens.
--
-- border_color overrides the border-style's default colour when set (null =
-- keep the style colour). door_token_ids ties door tokens to a room so a room
-- knows which doors are its entrances (authored in Adventure Maker; carried to
-- the live room on deploy). Prepared maps keep both on the room_regions JSONB,
-- so only the live table needs new columns.

ALTER TABLE map_room_regions
  ADD COLUMN IF NOT EXISTS border_color TEXT,
  ADD COLUMN IF NOT EXISTS door_token_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];
