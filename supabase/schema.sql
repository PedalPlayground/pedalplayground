-- Pedal Playground (starter) schema for cloud saves.
-- Paste into Supabase SQL Editor and run.
--
-- Notes:
-- - This schema is intentionally minimal: playground documents are stored as JSON snapshots.
-- - RLS is enabled. Policies allow users to access only their own playgrounds/versions.

create extension if not exists "pgcrypto";

-- A named playground container (user can have many).
create table if not exists public.playgrounds (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- future: forked_from_playground_id uuid null references public.playgrounds(id)
  unique (owner_user_id, name)
);

-- Immutable snapshots (versions) of a playground.
create table if not exists public.playground_versions (
  id uuid primary key default gen_random_uuid(),
  playground_id uuid not null references public.playgrounds (id) on delete cascade,
  created_at timestamptz not null default now(),
  version_number bigint,
  document jsonb not null
);

-- Auto-increment version_number per playground_id.
create or replace function public.set_playground_version_number()
returns trigger language plpgsql as $$
begin
  if new.version_number is null then
    select coalesce(max(version_number), 0) + 1
      into new.version_number
      from public.playground_versions
     where playground_id = new.playground_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_playground_version_number on public.playground_versions;
create trigger trg_set_playground_version_number
before insert on public.playground_versions
for each row execute function public.set_playground_version_number();

-- Keep playground.updated_at fresh.
create or replace function public.touch_playground_updated_at()
returns trigger language plpgsql as $$
begin
  update public.playgrounds
     set updated_at = now()
   where id = new.playground_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_playground_updated_at on public.playground_versions;
create trigger trg_touch_playground_updated_at
after insert on public.playground_versions
for each row execute function public.touch_playground_updated_at();

alter table public.playgrounds enable row level security;
alter table public.playground_versions enable row level security;

-- Policies: only owners can see/modify their playgrounds.
drop policy if exists "playgrounds_select_own" on public.playgrounds;
create policy "playgrounds_select_own"
on public.playgrounds for select
using (owner_user_id = auth.uid());

drop policy if exists "playgrounds_insert_own" on public.playgrounds;
create policy "playgrounds_insert_own"
on public.playgrounds for insert
with check (owner_user_id = auth.uid());

drop policy if exists "playgrounds_update_own" on public.playgrounds;
create policy "playgrounds_update_own"
on public.playgrounds for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "playgrounds_delete_own" on public.playgrounds;
create policy "playgrounds_delete_own"
on public.playgrounds for delete
using (owner_user_id = auth.uid());

-- Policies: only owners can see/insert versions for their playgrounds.
drop policy if exists "versions_select_own" on public.playground_versions;
create policy "versions_select_own"
on public.playground_versions for select
using (
  exists (
    select 1
      from public.playgrounds p
     where p.id = playground_versions.playground_id
       and p.owner_user_id = auth.uid()
  )
);

drop policy if exists "versions_insert_own" on public.playground_versions;
create policy "versions_insert_own"
on public.playground_versions for insert
with check (
  exists (
    select 1
      from public.playgrounds p
     where p.id = playground_versions.playground_id
       and p.owner_user_id = auth.uid()
  )
);


-- ---------------------------------------------------------------------------
-- Sharing & forking (safe to re-run)
-- ---------------------------------------------------------------------------

alter table public.playgrounds add column if not exists slug text unique;
alter table public.playgrounds add column if not exists is_public boolean not null default false;
alter table public.playgrounds
  add column if not exists forked_from_playground_id uuid null
  references public.playgrounds (id) on delete set null;

-- Anyone (including signed-out visitors) can read playgrounds that were shared.
drop policy if exists "playgrounds_select_public" on public.playgrounds;
create policy "playgrounds_select_public"
on public.playgrounds for select
using (is_public = true);

drop policy if exists "versions_select_public" on public.playground_versions;
create policy "versions_select_public"
on public.playground_versions for select
using (
  exists (
    select 1
      from public.playgrounds p
     where p.id = playground_versions.playground_id
       and p.is_public = true
  )
);

-- ---------------------------------------------------------------------------
-- Thumbnails for the playground switcher (safe to re-run)
-- ---------------------------------------------------------------------------

-- Small JPEG data URL (~10-20 KB) rendered client-side on save.
alter table public.playgrounds add column if not exists thumbnail text;
