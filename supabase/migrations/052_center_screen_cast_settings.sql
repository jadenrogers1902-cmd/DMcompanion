-- Center screen / cast display settings are DM-controlled per live map.
-- Stored on maps so the dedicated center-screen route can render the same
-- layout after refresh or on a separate display.

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS cast_settings JSONB NOT NULL DEFAULT '{
    "dynamicSplitEnabled": true,
    "splitDistanceFeet": 120,
    "layoutMode": "auto_grid",
    "mainFocus": "party_leader",
    "viewZoom": "balanced",
    "showPlayerNames": true,
    "showHealthBars": true,
    "showTokenHints": true,
    "showFog": true,
    "hideChromeByDefault": false
  }'::jsonb;

UPDATE maps
  SET cast_settings = jsonb_build_object(
    'dynamicSplitEnabled', COALESCE((cast_settings->>'dynamicSplitEnabled')::BOOLEAN, true),
    'splitDistanceFeet', GREATEST(0, LEAST(1000, COALESCE((cast_settings->>'splitDistanceFeet')::INTEGER, 120))),
    'layoutMode', COALESCE(NULLIF(cast_settings->>'layoutMode', ''), 'auto_grid'),
    'mainFocus', COALESCE(NULLIF(cast_settings->>'mainFocus', ''), 'party_leader'),
    'viewZoom', COALESCE(NULLIF(cast_settings->>'viewZoom', ''), 'balanced'),
    'showPlayerNames', COALESCE((cast_settings->>'showPlayerNames')::BOOLEAN, true),
    'showHealthBars', COALESCE((cast_settings->>'showHealthBars')::BOOLEAN, true),
    'showTokenHints', COALESCE((cast_settings->>'showTokenHints')::BOOLEAN, true),
    'showFog', COALESCE((cast_settings->>'showFog')::BOOLEAN, true),
    'hideChromeByDefault', COALESCE((cast_settings->>'hideChromeByDefault')::BOOLEAN, false)
  );
