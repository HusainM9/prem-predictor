-- Allow global predictions (league_id null) alongside league-scoped ones.
-- One prediction per (fixture_id, user_id) when global; one per (league_id, fixture_id, user_id) when league.

-- 1) Make league_id nullable (global predictions)
alter table public.predictions
  alter column league_id drop not null;

-- 2) Drop the existing unique so we can have global + per-league uniqueness
alter table public.predictions
  drop constraint if exists predictions_league_id_fixture_id_user_id_key;

-- 3) Partial unique: one global prediction per (fixture_id, user_id)
create unique index if not exists predictions_global_uniq
  on public.predictions (fixture_id, user_id)
  where league_id is null;

-- 4) Partial unique: one prediction per (league_id, fixture_id, user_id) per league
create unique index if not exists predictions_league_uniq
  on public.predictions (league_id, fixture_id, user_id)
  where league_id is not null;

-- 5) RLS: allow read/insert for own global predictions (league_id is null)
create policy "read own global predictions"
  on public.predictions for select
  using (league_id is null and user_id = auth.uid());

create policy "insert global prediction"
  on public.predictions for insert
  with check (league_id is null and user_id = auth.uid());
