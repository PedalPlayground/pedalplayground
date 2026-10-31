-- "What's new" posts shown behind the bell in the app header.
--
--   announcements   one row per post; anyone can read published ones, catalog editors write them from /editor/
--
-- The app reads the newest 20 once per visit (and caches them in the browser for the session), so this adds one
-- small query per visit. "Read" state lives in each browser's localStorage: there are no per-user writes.
-- "N new pedals added" posts are not stored here; the app builds them from the catalog's added dates.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  link_url text check (link_url is null or link_url ~ '^(https://|/)'),
  link_label text check (link_label is null or char_length(link_label) <= 40),
  -- A future time schedules the post; it stays hidden until then.
  published_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_published_at_idx on public.announcements (published_at desc);

alter table public.announcements enable row level security;

-- Guests can't call is_catalog_editor(), so they get their own policy. Editors also see scheduled posts.
drop policy if exists "announcements_select_published" on public.announcements;
create policy "announcements_select_published" on public.announcements for select to anon
  using (published_at <= now());

drop policy if exists "announcements_select_signed_in" on public.announcements;
create policy "announcements_select_signed_in" on public.announcements for select to authenticated
  using (published_at <= now() or public.is_catalog_editor());

drop policy if exists "announcements_insert_editors" on public.announcements;
create policy "announcements_insert_editors" on public.announcements for insert to authenticated
  with check (public.is_catalog_editor());

drop policy if exists "announcements_update_editors" on public.announcements;
create policy "announcements_update_editors" on public.announcements for update to authenticated
  using (public.is_catalog_editor()) with check (public.is_catalog_editor());

drop policy if exists "announcements_delete_editors" on public.announcements;
create policy "announcements_delete_editors" on public.announcements for delete to authenticated
  using (public.is_catalog_editor());

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

create or replace function public.announcements_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.announcements_touch();
