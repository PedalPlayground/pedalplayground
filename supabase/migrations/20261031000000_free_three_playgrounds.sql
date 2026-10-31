-- Free accounts can keep 3 saved playgrounds (was 1). Safe to re-run.
update public.plan_limits set max_playgrounds = 3 where plan = 'free';
