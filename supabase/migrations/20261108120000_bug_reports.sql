-- Bug reports from players (the Report a Bug tab of Suggest Gear). Safe to re-run.
-- Signed-in players file them; catalog editors read and close them on the Admin page (Moderation › Bug Reports).

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  details text not null check (char_length(btrim(details)) between 1 and 2000),
  -- Where it happened: the page's address, and the browser, filled in by the app.
  page text check (page is null or char_length(page) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz
);

create index if not exists bug_reports_open_idx on public.bug_reports (created_at) where status = 'open';
alter table public.bug_reports enable row level security;

-- Reports filed today by the signed-in player. Security definer: players can't read the table themselves.
create or replace function public.my_bug_reports_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.bug_reports where reporter_id = auth.uid() and created_at > now() - interval '1 day';
$$;
revoke execute on function public.my_bug_reports_today() from public, anon;
grant execute on function public.my_bug_reports_today() to authenticated;

-- A player files an open report as themselves, at most 10 a day.
drop policy if exists "bug_reports_insert_own" on public.bug_reports;
create policy "bug_reports_insert_own" on public.bug_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open' and closed_by is null and closed_at is null
    and public.my_bug_reports_today() < 10
  );

-- Editors read every report and close them.
drop policy if exists "bug_reports_select_editors" on public.bug_reports;
create policy "bug_reports_select_editors" on public.bug_reports for select to authenticated
  using (public.is_catalog_editor());

drop policy if exists "bug_reports_update_editors" on public.bug_reports;
create policy "bug_reports_update_editors" on public.bug_reports for update to authenticated
  using (public.is_catalog_editor())
  with check (public.is_catalog_editor());
