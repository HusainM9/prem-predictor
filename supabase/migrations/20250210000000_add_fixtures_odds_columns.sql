-- Add odds columns to fixtures if they don't exist (for existing DBs created before odds were added)
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_api_event_id text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_home numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_draw numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_away numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_locked_at timestamptz;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_bookmaker text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_home_current numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_draw_current numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_away_current numeric;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_current_updated_at timestamptz;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS odds_current_bookmaker text;
