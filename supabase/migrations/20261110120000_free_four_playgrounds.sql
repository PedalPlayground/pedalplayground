-- Free accounts can keep 4 saved playgrounds (was 3). Safe to re-run.
update public.plan_limits set max_playgrounds = 4 where plan = 'free';
