-- Catalog back end: pedals and pedalboards live here instead of in the git repo (safe to re-run).
-- Plan: https://claude.ai/artifact/Th1T16X9PZZaqDh4hURifG, setup and testing: docs/catalog-backend.md.
--
--   catalog_editors      who may review submissions (added by hand in the SQL editor)
--   catalog_items        the live catalog; written only by the functions below and the publish script
--   catalog_submissions  proposals from signed-in players: a new item, or a correction to an existing one
--
-- Storage: catalog-sources (private originals) and catalog-public (built WebP files + catalog.json).
-- Nothing here changes the live site: the app keeps reading the old catalog until VITE_CATALOG_BASE_URL is switched.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------------------------------------------
-- Editors

create table if not exists public.catalog_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- No policies: nobody reads or writes this table directly. Add an editor in the SQL editor:
--   insert into public.catalog_editors (user_id) select user_id from public.profiles where username = 'Trav';
alter table public.catalog_editors enable row level security;

create or replace function public.is_catalog_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.catalog_editors where user_id = auth.uid());
$$;

revoke execute on function public.is_catalog_editor() from public, anon;
grant execute on function public.is_catalog_editor() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Shared field rules. Keep the spec lists in step with web/src/lib/specs.ts and web/scripts/catalog/validate.mjs.

create or replace function public.catalog_voltage_ok(v text)
returns boolean language sql immutable as $$
  select v is null or v in ('9V DC', '12V DC', '18V DC', '24V DC', '9V AC', '12V AC', '5V USB');
$$;

create or replace function public.catalog_type_ok(t text)
returns boolean language sql immutable as $$
  select t is null or t in ('Boost', 'Overdrive', 'Distortion', 'Fuzz', 'Compressor', 'EQ', 'Modulation', 'Delay',
    'Reverb', 'Pitch', 'Filter / Wah', 'Looper', 'Multi-Effect', 'Amp / Preamp', 'Tuner', 'Volume / Expression',
    'Noise Gate', 'Utility', 'Other');
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Items

create table if not exists public.catalog_items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('pedal', 'pedalboard')),
  -- The image key saved boards use to find this item (the old filename without .png). Never changes.
  key text not null check (char_length(key) between 1 and 200),
  brand text not null check (char_length(brand) between 1 and 120),
  name text not null check (char_length(name) between 1 and 200),
  width_in numeric(6, 3) not null check (width_in > 0 and width_in <= 60),
  height_in numeric(6, 3) not null check (height_in > 0 and height_in <= 60),
  current_ma integer check (current_ma is null or current_ma between 0 and 10000),
  voltage text check (public.catalog_voltage_ok(voltage)),
  type text check (kind = 'pedal' or type is null),
  -- Original image in catalog-sources. Null only for imported entries whose image was already missing.
  source_path text,
  -- Set by the publish script: hash of the source bytes, and the built files' paths in catalog-public.
  source_hash text,
  thumb_path text,
  img_path text,
  -- True when the source changed and the publish script hasn't built it yet.
  needs_render boolean not null default true,
  -- Retired items leave search but keep their images, so saved boards still draw them.
  status text not null default 'live' check (status in ('live', 'retired')),
  -- The day the item joined the catalog, for What's New (imported from git history).
  added_on date not null default current_date,
  submitted_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, key),
  constraint catalog_items_type_ok check (public.catalog_type_ok(type))
);

create index if not exists catalog_items_needs_render_idx on public.catalog_items (id) where needs_render;

-- Editors can read items (the editor page searches them); everyone else uses the published catalog.json.
-- No write policies: only the functions below (security definer) and the service role write.
alter table public.catalog_items enable row level security;

drop policy if exists "catalog_items_select_editors" on public.catalog_items;
create policy "catalog_items_select_editors" on public.catalog_items for select to authenticated
  using (public.is_catalog_editor());

-- ---------------------------------------------------------------------------------------------------------------
-- Submissions

create table if not exists public.catalog_submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'pedal' check (kind in ('pedal', 'pedalboard')),
  -- Set for a correction to an existing item; null for a new one.
  target_key text check (target_key is null or char_length(target_key) between 1 and 200),
  brand text not null check (char_length(brand) between 1 and 120),
  name text not null check (char_length(name) between 1 and 200),
  width_in numeric(6, 3) not null check (width_in > 0 and width_in <= 60),
  height_in numeric(6, 3) not null check (height_in > 0 and height_in <= 60),
  current_ma integer check (current_ma is null or current_ma between 0 and 10000),
  voltage text check (public.catalog_voltage_ok(voltage)),
  type text check (kind = 'pedal' or type is null),
  -- The uploaded image in catalog-sources, under submissions/<user id>/. A correction may leave it null.
  source_path text,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'needs_changes', 'approved', 'rejected')),
  editor_note text check (editor_note is null or char_length(editor_note) <= 1000),
  submitted_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  -- The item this became, once approved.
  item_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_submissions_type_ok check (public.catalog_type_ok(type)),
  constraint catalog_submissions_has_image check (target_key is not null or source_path is not null)
);

create index if not exists catalog_submissions_queue_idx on public.catalog_submissions (created_at) where status = 'pending';
create index if not exists catalog_submissions_by_user_idx on public.catalog_submissions (submitted_by, created_at desc);

alter table public.catalog_submissions enable row level security;

drop policy if exists "catalog_submissions_select" on public.catalog_submissions;
create policy "catalog_submissions_select" on public.catalog_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.is_catalog_editor());

-- A player can only file a fresh, pending submission as themselves, with an image from their own upload folder.
drop policy if exists "catalog_submissions_insert_own" on public.catalog_submissions;
create policy "catalog_submissions_insert_own" on public.catalog_submissions for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null and reviewed_at is null and editor_note is null and item_key is null
    and (source_path is null or source_path like 'submissions/' || auth.uid()::text || '/%')
  );

-- Editors fix fields in place before approving. Approval itself goes through approve_catalog_submission().
drop policy if exists "catalog_submissions_update_editors" on public.catalog_submissions;
create policy "catalog_submissions_update_editors" on public.catalog_submissions for update to authenticated
  using (public.is_catalog_editor() and status in ('pending', 'needs_changes'))
  with check (public.is_catalog_editor() and status in ('pending', 'needs_changes'));

-- A player can withdraw their own submission while nobody has acted on it.
drop policy if exists "catalog_submissions_delete_own" on public.catalog_submissions;
create policy "catalog_submissions_delete_own" on public.catalog_submissions for delete to authenticated
  using (submitted_by = auth.uid() and status = 'pending');

-- At most 10 open submissions per player, to keep the queue manageable. Editors aren't limited.
create or replace function public.catalog_submission_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor()
     and (select count(*) from public.catalog_submissions
           where submitted_by = new.submitted_by and status in ('pending', 'needs_changes')) >= 10 then
    raise exception 'You have 10 submissions waiting for review. Please wait for those first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_catalog_submission_limit on public.catalog_submissions;
create trigger trg_catalog_submission_limit
  before insert on public.catalog_submissions
  for each row execute function public.catalog_submission_limit();

create or replace function public.catalog_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_catalog_submissions_touch on public.catalog_submissions;
create trigger trg_catalog_submissions_touch
  before update on public.catalog_submissions
  for each row execute function public.catalog_touch_updated_at();

drop trigger if exists trg_catalog_items_touch on public.catalog_items;
create trigger trg_catalog_items_touch
  before update on public.catalog_items
  for each row execute function public.catalog_touch_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Review functions (editors only)

-- A key for a new item from its brand and name, like the filenames contributors used: "boss-ds-1".
-- Adds -2, -3… when the key is taken.
create or replace function public.catalog_new_key(p_kind text, p_brand text, p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text := left(trim(both '-' from regexp_replace(lower(p_brand || '-' || p_name), '[^a-z0-9]+', '-', 'g')), 180);
  candidate text;
  n int := 1;
begin
  if base = '' then base := 'item'; end if;
  candidate := base;
  while exists (select 1 from public.catalog_items where kind = p_kind and key = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Approves a submission: creates the item (or applies the correction) and marks it for the publish script.
-- Returns the item's key. Call the catalog-publish Edge Function afterwards to build and publish it.
create or replace function public.approve_catalog_submission(submission_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.catalog_submissions;
  k text;
begin
  if not public.is_catalog_editor() then
    raise exception 'Only catalog editors can approve submissions.' using errcode = '42501';
  end if;

  select * into s from public.catalog_submissions where id = submission_id for update;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if s.status not in ('pending', 'needs_changes') then
    raise exception 'This submission was already %.', s.status using errcode = 'P0001';
  end if;

  if s.target_key is not null then
    update public.catalog_items
       set brand = s.brand, name = s.name, width_in = s.width_in, height_in = s.height_in,
           current_ma = s.current_ma, voltage = s.voltage, type = s.type,
           source_path = coalesce(s.source_path, source_path),
           needs_render = needs_render or s.source_path is not null,
           approved_by = auth.uid()
     where kind = s.kind and key = s.target_key
     returning key into k;
    if k is null then
      raise exception 'The item this corrects (%) no longer exists.', s.target_key using errcode = 'P0002';
    end if;
  else
    k := public.catalog_new_key(s.kind, s.brand, s.name);
    insert into public.catalog_items
      (kind, key, brand, name, width_in, height_in, current_ma, voltage, type, source_path, submitted_by, approved_by)
    values
      (s.kind, k, s.brand, s.name, s.width_in, s.height_in, s.current_ma, s.voltage, s.type, s.source_path,
       s.submitted_by, auth.uid());
  end if;

  update public.catalog_submissions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), item_key = k
   where id = submission_id;
  return k;
end;
$$;

-- Sends a submission back to its author with a note, or rejects it.
create or replace function public.review_catalog_submission(submission_id uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only catalog editors can review submissions.' using errcode = '42501';
  end if;
  if decision not in ('needs_changes', 'rejected') then
    raise exception 'Decision must be needs_changes or rejected.' using errcode = '22023';
  end if;
  update public.catalog_submissions
     set status = decision, editor_note = left(note, 1000), reviewed_by = auth.uid(), reviewed_at = now()
   where id = submission_id and status in ('pending', 'needs_changes');
  if not found then
    raise exception 'Submission not found, or already approved or rejected.' using errcode = 'P0002';
  end if;
end;
$$;

-- Retires an item (out of search, still drawn on saved boards) or brings it back.
create or replace function public.set_catalog_item_status(p_kind text, p_key text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only catalog editors can change items.' using errcode = '42501';
  end if;
  if p_status not in ('live', 'retired') then
    raise exception 'Status must be live or retired.' using errcode = '22023';
  end if;
  update public.catalog_items set status = p_status, approved_by = auth.uid() where kind = p_kind and key = p_key;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.approve_catalog_submission(uuid) from public, anon;
revoke execute on function public.review_catalog_submission(uuid, text, text) from public, anon;
revoke execute on function public.set_catalog_item_status(text, text, text) from public, anon;
revoke execute on function public.catalog_new_key(text, text, text) from public, anon, authenticated;
grant execute on function public.approve_catalog_submission(uuid) to authenticated;
grant execute on function public.review_catalog_submission(uuid, text, text) to authenticated;
grant execute on function public.set_catalog_item_status(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Storage

-- Sources: private. 10 MB here; the submit form holds players to 3 MB, and imported pedalboards can be larger.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-sources', 'catalog-sources', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Built files: public read (served through Supabase's CDN). Only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-public', 'catalog-public', true, 10485760, array['image/webp', 'application/json'])
on conflict (id) do nothing;

-- Players upload to submissions/<their user id>/…
drop policy if exists "catalog_sources_insert_own" on storage.objects;
create policy "catalog_sources_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog-sources'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- …and can read back their own uploads; editors can read every source.
drop policy if exists "catalog_sources_select" on storage.objects;
create policy "catalog_sources_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'catalog-sources'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_catalog_editor())
  );
