insert into public.fixtures (season, gameweek, kickoff_time, home_team, away_team, status)
values
('2025/26', 1, now() + interval '3 days', 'Arsenal', 'Chelsea', 'scheduled'),
('2025/26', 1, now() + interval '4 days', 'Liverpool', 'Man City', 'scheduled');
