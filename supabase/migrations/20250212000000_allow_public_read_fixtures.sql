-- Allow unauthenticated users to read fixtures (so they can view Play / Matches without logging in).
-- Submitting predictions still requires auth; this only makes fixture list and odds visible to all.
create policy "read fixtures public"
on public.fixtures for select
using (true);
