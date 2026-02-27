-- Add columns required for scoring: locked odds at prediction time, stake, settlement and points.
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS stake numeric NOT NULL DEFAULT 10;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS locked_odds numeric;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS points_awarded numeric;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS bonus_exact_score_points numeric;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS bonus_points numeric;
