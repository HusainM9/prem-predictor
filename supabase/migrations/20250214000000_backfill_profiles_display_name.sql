-- Backfill display_name for existing users. Creates missing profile rows, then
-- sets display_name from email local part where it's still default. Safe to run multiple times.

-- Ensure every auth user has a profile (in case they signed up before the trigger existed).
insert into public.profiles (id, display_name)
select
  a.id,
  coalesce(nullif(trim(split_part(a.email, '@', 1)), ''), 'Player')
from auth.users a
where not exists (select 1 from public.profiles p where p.id = a.id)
on conflict (id) do nothing;

-- Update existing profiles that still have default/empty display_name.
update public.profiles p
set
  display_name = coalesce(
    nullif(trim(split_part(a.email, '@', 1)), ''),
    'Player'
  ),
  updated_at = now()
from auth.users a
where a.id = p.id
  and (p.display_name = 'Player' or p.display_name is null or trim(p.display_name) = '');
