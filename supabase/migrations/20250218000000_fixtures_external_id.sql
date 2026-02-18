-- Support import from Football-Data.org: upsert by external_source + external_id.
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fixtures_external
  ON public.fixtures (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
