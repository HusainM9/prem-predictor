-- Fix infinite recursion: "read league members if member" queried league_members
-- and triggered the same policy. Use a SECURITY DEFINER function so the check
-- runs without RLS.

create or replace function public.is_league_member(check_league_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = check_league_id and user_id = check_user_id
  );
$$;

-- Drop the recursive policy and replace with one that uses the function
drop policy if exists "read league members if member" on public.league_members;

create policy "read league members if member"
  on public.league_members for select
  using (
    user_id = auth.uid()
    or public.is_league_member(league_id, auth.uid())
  );
