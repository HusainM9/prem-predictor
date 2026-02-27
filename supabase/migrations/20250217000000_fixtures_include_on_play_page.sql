-- Allow admins to show specific fixtures on the Play page (e.g. rescheduled matches from another gameweek).
alter table public.fixtures
  add column if not exists include_on_play_page boolean not null default false;
