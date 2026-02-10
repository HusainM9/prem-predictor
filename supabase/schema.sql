create extension if not exists "pgcrypto";

-- 1) Leagues
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- 

-- 2) League members (network table)
create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- Helpful index
create index if not exists idx_league_members_user on public.league_members(user_id);

-- 3) Fixtures (matches)
create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season text not null,                 -- e.g. '2025/26'
  gameweek int not null,
  kickoff_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  status text not null default 'scheduled' check (status in ('scheduled','finished')),
  home_goals int,
  away_goals int,
  created_at timestamptz not null default now(),
  -- Odds (The Odds API): mapping + current live + locked
  odds_api_event_id text,
  odds_home numeric,
  odds_draw numeric,
  odds_away numeric,
  odds_locked_at timestamptz,
  odds_bookmaker text,
  odds_home_current numeric,
  odds_draw_current numeric,
  odds_away_current numeric,
  odds_current_updated_at timestamptz,
  odds_current_bookmaker text
);

create index if not exists idx_fixtures_gw on public.fixtures(season, gameweek);

-- 4) Predictions
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pred_home_goals int not null check (pred_home_goals >= 0),
  pred_away_goals int not null check (pred_away_goals >= 0),
  submitted_at timestamptz not null default now(),
  unique (league_id, fixture_id, user_id)
);

create index if not exists idx_predictions_league on public.predictions(league_id);
create index if not exists idx_predictions_user on public.predictions(user_id);

-- =========================
-- Row Level Security (RLS)
-- =========================
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.fixtures enable row level security;
alter table public.predictions enable row level security;

-- Leagues:
-- Read leagues only if you're a member
create policy "read leagues if member"
on public.leagues for select
using (
  exists (
    select 1 from public.league_members lm
    where lm.league_id = leagues.id
      and lm.user_id = auth.uid()
  )
);

-- Create league if logged in
create policy "create league if logged in"
on public.leagues for insert
with check (auth.uid() = owner_id);

-- League members:
-- Read members only if you're in that league
create policy "read league members if member"
on public.league_members for select
using (
  exists (
    select 1 from public.league_members lm
    where lm.league_id = league_members.league_id
      and lm.user_id = auth.uid()
  )
);

-- Join league: allow inserting your own membership row
create policy "join league as self"
on public.league_members for insert
with check (auth.uid() = user_id);

-- Predictions:
-- Read predictions only if you're in that league
create policy "read predictions if member"
on public.predictions for select
using (
  exists (
    select 1 from public.league_members lm
    where lm.league_id = predictions.league_id
      and lm.user_id = auth.uid()
  )
);

-- Create prediction only if:
-- 1) you're creating for yourself
-- 2) you're a member of that league
create policy "insert prediction if member"
on public.predictions for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.league_members lm
    where lm.league_id = predictions.league_id
      and lm.user_id = auth.uid()
  )
);

-- Update your own prediction only (we'll enforce kickoff lock in app logic first)
create policy "update own prediction"
on public.predictions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Fixtures:
-- Allow anyone logged in to read fixtures (simple)
create policy "read fixtures if logged in"
on public.fixtures for select
using (auth.uid() is not null);
