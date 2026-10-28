-- Trending gear for the search panel (safe to re-run).
-- Each time someone adds a catalog pedal or pedalboard to a playground, the app records it here. Nobody reads or
-- writes the table directly: record_gear_add inserts, and trending_gear returns counts only (no who, no when).

create table if not exists public.gear_adds (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('pedal', 'pedalboard')),
  image text not null check (char_length(image) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists gear_adds_recent_idx on public.gear_adds (created_at desc);

-- Row-level security with no policies: no direct access for anon or signed-in users.
alter table public.gear_adds enable row level security;

create or replace function public.record_gear_add(kind text, image text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.gear_adds (kind, image) values (kind, image);
$$;

-- The most-added gear over the last `days` days.
create or replace function public.trending_gear(days int default 30, max_items int default 30)
returns table (kind text, image text, adds bigint)
language sql
stable
security definer
set search_path = public
as $$
  select g.kind, g.image, count(*) as adds
    from public.gear_adds g
   where g.created_at > now() - make_interval(days => least(greatest(days, 1), 365))
   group by g.kind, g.image
   order by adds desc, max(g.created_at) desc
   limit least(greatest(max_items, 1), 100);
$$;

grant execute on function public.record_gear_add(text, text) to anon, authenticated;
grant execute on function public.trending_gear(int, int) to anon, authenticated;
