-- Pedal types move from a fixed list (catalog_type_ok) into a table that admins edit in Admin > Types. Safe to re-run.
--
--   pedal_types           the list, in order. Everyone reads it; only admins change it, through the functions below.
--   add_pedal_type        adds one at the end
--   rename_pedal_type     renames one, and every catalog item and submission that uses it
--   remove_pedal_type     removes one; its pedals move to another type, or just lose it
--   reorder_pedal_types   sets the order
--
-- The publish script copies the list into catalog.json (pedalTypes), which is where the site reads it. Until this
-- runs, the site and the publish script keep using the built-in list in web/src/lib/specs.ts.

create table if not exists public.pedal_types (
  name text primary key check (char_length(name) between 1 and 40 and name = btrim(name)),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- No two types that differ only in case ("EQ" and "Eq").
create unique index if not exists pedal_types_name_lower_idx on public.pedal_types (lower(name));

alter table public.pedal_types enable row level security;

-- Everyone can read the list. No write policies: only the functions below (admins) and the service role write.
drop policy if exists "pedal_types_select_all" on public.pedal_types;
create policy "pedal_types_select_all" on public.pedal_types for select to anon, authenticated using (true);
grant select on public.pedal_types to anon, authenticated;

-- The list as it was in catalog_type_ok, in the same order.
insert into public.pedal_types (name, position)
select t, i from unnest(array[
  'Boost', 'Overdrive', 'Distortion', 'Fuzz', 'Compressor', 'EQ', 'Modulation', 'Delay', 'Reverb', 'Pitch',
  'Filter / Wah', 'Looper', 'Multi-Effect', 'Amp / Preamp', 'Tuner', 'Volume / Expression', 'Noise Gate', 'Utility', 'Other'
]) with ordinality as u(t, i)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Checking types against the table
--
-- The old checks were CHECK constraints over a fixed list. A CHECK that reads another table can break a backup
-- restore (rows load before the list does), so a trigger checks instead; triggers are restored after the data.

create or replace function public.catalog_type_ok(t text)
returns boolean language sql stable set search_path = public as $$
  select t is null or exists (select 1 from public.pedal_types where name = t);
$$;

create or replace function public.catalog_types_ok(ts text[])
returns boolean language sql stable set search_path = public as $$
  select ts is not null and cardinality(ts) <= 4 and coalesce(bool_and(public.catalog_type_ok(t) and t is not null), true)
  from unnest(ts) as t;
$$;

alter table public.catalog_items drop constraint if exists catalog_items_type_ok;
alter table public.catalog_submissions drop constraint if exists catalog_submissions_type_ok;
alter table public.catalog_items drop constraint if exists catalog_items_extra_types_ok;
alter table public.catalog_submissions drop constraint if exists catalog_submissions_extra_types_ok;

-- What a CHECK can still say without the list: at most 4 extra types, no blanks, and none on pedalboards.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_extra_types_shape') then
    alter table public.catalog_items add constraint catalog_items_extra_types_shape
      check (cardinality(extra_types) <= 4 and array_position(extra_types, null) is null and (kind = 'pedal' or cardinality(extra_types) = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_submissions_extra_types_shape') then
    alter table public.catalog_submissions add constraint catalog_submissions_extra_types_shape
      check (cardinality(extra_types) <= 4 and array_position(extra_types, null) is null and (kind = 'pedal' or cardinality(extra_types) = 0));
  end if;
end;
$$;

create or replace function public.catalog_check_types()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.catalog_type_ok(new.type) then
    raise exception '"%" isn''t a pedal type.', new.type using errcode = '23514';
  end if;
  if not public.catalog_types_ok(new.extra_types) then
    raise exception 'One of the extra types (%) isn''t a pedal type.', array_to_string(new.extra_types, ', ') using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_items_check_types on public.catalog_items;
create trigger catalog_items_check_types before insert or update of type, extra_types on public.catalog_items
  for each row execute function public.catalog_check_types();

drop trigger if exists catalog_submissions_check_types on public.catalog_submissions;
create trigger catalog_submissions_check_types before insert or update of type, extra_types on public.catalog_submissions
  for each row execute function public.catalog_check_types();

-- ---------------------------------------------------------------------------------------------------------------
-- Admin functions

-- A row's types (main first, then extras) with one type swapped for another, or taken out when new_type is null.
-- Repeats are dropped, keeping the first. Returns every type, main first; the caller splits it back up.
create or replace function public.catalog_swap_type(main text, extras text[], old_type text, new_type text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(t order by i), '{}')
    from (
      select distinct on (t) t, i
        from (
          select case when x = old_type then new_type else x end as t, i
            from unnest(case when main is null then coalesce(extras, '{}') else array_prepend(main, coalesce(extras, '{}')) end)
                 with ordinality as u(x, i)
        ) swapped
       where t is not null
       order by t, i
    ) kept;
$$;

-- Swaps a type on every catalog item and submission that has it (archived and old ones too). Returns how many
-- catalog items changed.
create or replace function public.catalog_retype(old_type text, new_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with changed as (
    update public.catalog_items c
       set type = s.ts[1], extra_types = coalesce(s.ts[2:], '{}'), updated_at = now()
      from (select id, public.catalog_swap_type(type, extra_types, old_type, new_type) as ts
              from public.catalog_items
             where type = old_type or old_type = any(extra_types)) s
     where c.id = s.id
    returning 1
  )
  select count(*) into n from changed;

  update public.catalog_submissions c
     set type = s.ts[1], extra_types = coalesce(s.ts[2:], '{}')
    from (select id, public.catalog_swap_type(type, extra_types, old_type, new_type) as ts
            from public.catalog_submissions
           where type = old_type or old_type = any(extra_types)) s
   where c.id = s.id;

  return n;
end;
$$;
revoke execute on function public.catalog_retype(text, text) from public, anon, authenticated;

create or replace function public.add_pedal_type(type_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := btrim(type_name);
begin
  if not public.is_admin() then
    raise exception 'Only admins can change pedal types.' using errcode = '42501';
  end if;
  if t is null or t = '' then
    raise exception 'Give the type a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.pedal_types where lower(name) = lower(t)) then
    raise exception 'There''s already a type called "%".', t using errcode = '23505';
  end if;
  insert into public.pedal_types (name, position)
  values (t, coalesce((select max(position) from public.pedal_types), 0) + 1);
end;
$$;
revoke execute on function public.add_pedal_type(text) from public, anon;
grant execute on function public.add_pedal_type(text) to authenticated;

-- Returns how many catalog items changed (they need a publish to show the new name).
create or replace function public.rename_pedal_type(old_name text, new_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := btrim(new_name);
begin
  if not public.is_admin() then
    raise exception 'Only admins can change pedal types.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pedal_types where name = old_name) then
    raise exception 'There''s no type called "%".', old_name using errcode = 'P0002';
  end if;
  if t is null or t = '' then
    raise exception 'Give the type a name.' using errcode = '22023';
  end if;
  if t = old_name then
    return 0;
  end if;
  -- A change of case only ("Eq" to "EQ") is fine; another type's name isn't (Remove it and move its pedals instead).
  if exists (select 1 from public.pedal_types where lower(name) = lower(t) and name <> old_name) then
    raise exception 'There''s already a type called "%". To merge them, remove "%" and move its pedals there.', t, old_name
      using errcode = '23505';
  end if;
  update public.pedal_types set name = t where name = old_name;
  return public.catalog_retype(old_name, t);
end;
$$;
revoke execute on function public.rename_pedal_type(text, text) from public, anon;
grant execute on function public.rename_pedal_type(text, text) to authenticated;

-- move_to null: pedals just lose the type (an extra type, if they have one, becomes the main one).
-- Returns how many catalog items changed.
create or replace function public.remove_pedal_type(type_name text, move_to text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change pedal types.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pedal_types where name = type_name) then
    raise exception 'There''s no type called "%".', type_name using errcode = 'P0002';
  end if;
  if move_to is not null and (move_to = type_name or not exists (select 1 from public.pedal_types where name = move_to)) then
    raise exception 'Pick another type to move its pedals to.' using errcode = '22023';
  end if;
  n := public.catalog_retype(type_name, move_to);
  delete from public.pedal_types where name = type_name;
  return n;
end;
$$;
revoke execute on function public.remove_pedal_type(text, text) from public, anon;
grant execute on function public.remove_pedal_type(text, text) to authenticated;

-- names: every type, in the new order.
create or replace function public.reorder_pedal_types(names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change pedal types.' using errcode = '42501';
  end if;
  if (select count(distinct x) from unnest(names) x) <> cardinality(names)
     or cardinality(names) <> (select count(*) from public.pedal_types)
     or exists (select 1 from unnest(names) x where not exists (select 1 from public.pedal_types where name = x)) then
    raise exception 'The list changed while you were editing it. Reload and try again.' using errcode = '40001';
  end if;
  update public.pedal_types p set position = u.i from unnest(names) with ordinality as u(x, i) where p.name = u.x;
end;
$$;
revoke execute on function public.reorder_pedal_types(text[]) from public, anon;
grant execute on function public.reorder_pedal_types(text[]) to authenticated;
