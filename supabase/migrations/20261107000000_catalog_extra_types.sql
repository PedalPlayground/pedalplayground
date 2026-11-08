-- A pedal can have more than one type: `type` stays the main one (the Equipment List shows it), and `extra_types`
-- holds any others ("Xotic BB Preamp": Overdrive, plus Amp / Preamp). Safe to run again.

create or replace function public.catalog_types_ok(ts text[])
returns boolean language sql immutable as $$
  select ts is not null and cardinality(ts) <= 4 and coalesce(bool_and(public.catalog_type_ok(t) and t is not null), true)
  from unnest(ts) as t;
$$;

alter table public.catalog_items add column if not exists extra_types text[] not null default '{}';
alter table public.catalog_submissions add column if not exists extra_types text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_items_extra_types_ok') then
    alter table public.catalog_items add constraint catalog_items_extra_types_ok
      check (public.catalog_types_ok(extra_types) and (kind = 'pedal' or cardinality(extra_types) = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalog_submissions_extra_types_ok') then
    alter table public.catalog_submissions add constraint catalog_submissions_extra_types_ok
      check (public.catalog_types_ok(extra_types) and (kind = 'pedal' or cardinality(extra_types) = 0));
  end if;
end;
$$;

-- Same as in 20261029000000_catalog.sql, plus extra_types (with the main type and repeats taken out).
create or replace function public.approve_catalog_submission(submission_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.catalog_submissions;
  k text;
  extras text[];
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

  extras := coalesce(
    (select array_agg(t order by i) from (
       select distinct on (t) t, i from unnest(s.extra_types) with ordinality as u(t, i)
        where s.type is distinct from t order by t, i) d),
    '{}');

  if s.target_key is not null then
    update public.catalog_items
       set brand = s.brand, name = s.name, width_in = s.width_in, height_in = s.height_in,
           current_ma = s.current_ma, voltage = s.voltage, type = s.type, extra_types = extras,
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
      (kind, key, brand, name, width_in, height_in, current_ma, voltage, type, extra_types, source_path, submitted_by, approved_by)
    values
      (s.kind, k, s.brand, s.name, s.width_in, s.height_in, s.current_ma, s.voltage, s.type, extras, s.source_path,
       s.submitted_by, auth.uid());
  end if;

  update public.catalog_submissions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), item_key = k
   where id = submission_id;
  return k;
end;
$$;

revoke execute on function public.approve_catalog_submission(uuid) from public, anon;
grant execute on function public.approve_catalog_submission(uuid) to authenticated;
