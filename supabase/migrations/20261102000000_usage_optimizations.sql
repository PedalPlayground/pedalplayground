-- Database load reductions from the 2026-11-02 usage review (safe to re-run).
--
-- 1. save_playground_version: autosave updates the newest history entry when it's under 5 minutes old, instead of
--    inserting a version per save (which the prune trigger then deletes). History keeps a checkpoint every 5 minutes.
-- 2. trending_gear reads a cached result, recounted at most every 10 minutes, instead of counting 30 days of
--    gear_adds on every visit.
-- 3. Row-level security rules call auth.uid() once per query instead of once per row (Supabase advisor
--    auth_rls_initplan), and the two SELECT rules on playgrounds and playground_versions are merged into one each
--    (multiple_permissive_policies). Same access as before.
-- 4. Indexes on foreign keys the advisor flagged (unindexed_foreign_keys).

-- 1. Saving a playground's document ------------------------------------------------------------------------------

create or replace function public.save_playground_version(p_playground_id uuid, p_document jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_id uuid;
  latest_at timestamptz;
begin
  -- Runs as the owner (there's no update policy on playground_versions), so check ownership here.
  if not exists (select 1 from public.playgrounds p where p.id = p_playground_id and p.owner_user_id = auth.uid()) then
    raise exception 'Not your playground.' using errcode = '42501';
  end if;

  select v.id, v.created_at into latest_id, latest_at
    from public.playground_versions v
   where v.playground_id = p_playground_id
   order by v.version_number desc nulls last, v.created_at desc
   limit 1;

  if latest_id is not null and latest_at > now() - interval '5 minutes' then
    update public.playground_versions set document = p_document where id = latest_id;
    -- An insert does this through trg_touch_playground_updated_at.
    update public.playgrounds set updated_at = now() where id = p_playground_id;
  else
    insert into public.playground_versions (playground_id, document) values (p_playground_id, p_document);
  end if;
end;
$$;

revoke execute on function public.save_playground_version(uuid, jsonb) from public, anon;
grant execute on function public.save_playground_version(uuid, jsonb) to authenticated;

-- 2. Trending gear cache -----------------------------------------------------------------------------------------

create table if not exists public.trending_gear_cache (
  cache_key text primary key,
  entries jsonb not null,
  refreshed_at timestamptz not null
);

-- Row-level security with no policies: only trending_gear reads and writes it.
alter table public.trending_gear_cache enable row level security;

create or replace function public.trending_gear(days int default 30, max_items int default 30)
returns table (kind text, image text, adds bigint)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d int := least(greatest(trending_gear.days, 1), 365);
  m int := least(greatest(trending_gear.max_items, 1), 100);
  k text := d || ':' || m;
  cached jsonb;
  fresh_at timestamptz;
begin
  select c.entries, c.refreshed_at into cached, fresh_at from public.trending_gear_cache c where c.cache_key = k;

  -- Stale: one caller recounts (the others keep serving the previous result); empty: everyone counts.
  if fresh_at is null or (fresh_at < now() - interval '10 minutes' and pg_try_advisory_xact_lock(hashtext('trending_gear:' || k))) then
    select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'image', t.image, 'adds', t.n) order by t.n desc, t.last_add desc), '[]'::jsonb)
      into cached
      from (
        select g.kind, g.image, count(*) as n, max(g.created_at) as last_add
          from public.gear_adds g
         where g.created_at > now() - make_interval(days => d)
         group by g.kind, g.image
         order by 3 desc, 4 desc
         limit m
      ) t;
    insert into public.trending_gear_cache (cache_key, entries, refreshed_at) values (k, cached, now())
    on conflict (cache_key) do update set entries = excluded.entries, refreshed_at = excluded.refreshed_at;
  end if;

  return query
    select e->>'kind', e->>'image', (e->>'adds')::bigint
      from jsonb_array_elements(cached) with ordinality as x(e, i)
     order by x.i;
end;
$$;

grant execute on function public.trending_gear(int, int) to anon, authenticated;

-- 3. Row-level security: same rules, evaluated once per query ----------------------------------------------------

drop policy if exists playgrounds_select_own on public.playgrounds;
drop policy if exists playgrounds_select_public on public.playgrounds;
drop policy if exists playgrounds_select on public.playgrounds;
create policy playgrounds_select on public.playgrounds
  for select using (is_public = true or owner_user_id = (select auth.uid()));

drop policy if exists playgrounds_insert_own on public.playgrounds;
create policy playgrounds_insert_own on public.playgrounds
  for insert with check (owner_user_id = (select auth.uid()));

drop policy if exists playgrounds_update_own on public.playgrounds;
create policy playgrounds_update_own on public.playgrounds
  for update using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists playgrounds_delete_own on public.playgrounds;
create policy playgrounds_delete_own on public.playgrounds
  for delete using (owner_user_id = (select auth.uid()));

drop policy if exists versions_select_own on public.playground_versions;
drop policy if exists versions_select_public on public.playground_versions;
drop policy if exists versions_select on public.playground_versions;
create policy versions_select on public.playground_versions
  for select using (
    exists (
      select 1 from public.playgrounds p
       where p.id = playground_versions.playground_id
         and (p.is_public = true or p.owner_user_id = (select auth.uid()))
    )
  );

drop policy if exists versions_insert_own on public.playground_versions;
create policy versions_insert_own on public.playground_versions
  for insert with check (
    exists (
      select 1 from public.playgrounds p
       where p.id = playground_versions.playground_id and p.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (user_id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists catalog_submissions_select on public.catalog_submissions;
create policy catalog_submissions_select on public.catalog_submissions
  for select to authenticated using (submitted_by = (select auth.uid()) or public.is_catalog_editor());

drop policy if exists catalog_submissions_insert_own on public.catalog_submissions;
create policy catalog_submissions_insert_own on public.catalog_submissions
  for insert to authenticated with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and editor_note is null
    and item_key is null
    and (source_path is null or source_path like 'submissions/' || (select auth.uid())::text || '/%')
  );

drop policy if exists catalog_submissions_delete_own on public.catalog_submissions;
create policy catalog_submissions_delete_own on public.catalog_submissions
  for delete to authenticated using (submitted_by = (select auth.uid()) and status = 'pending');

-- 4. Foreign key indexes -----------------------------------------------------------------------------------------

create index if not exists announcements_created_by_idx on public.announcements (created_by);
create index if not exists catalog_items_approved_by_idx on public.catalog_items (approved_by);
create index if not exists catalog_items_submitted_by_idx on public.catalog_items (submitted_by);
create index if not exists catalog_submissions_reviewed_by_idx on public.catalog_submissions (reviewed_by);
create index if not exists gallery_hidden_hidden_by_idx on public.gallery_hidden (hidden_by);
create index if not exists gallery_likes_user_id_idx on public.gallery_likes (user_id);
create index if not exists playgrounds_forked_from_idx on public.playgrounds (forked_from_playground_id);
