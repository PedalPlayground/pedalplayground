-- Keep autosave history bounded.
--
-- Every autosave inserts a full document into playground_versions. The app only ever reads the newest one,
-- so after each insert we delete everything older than the newest 20 versions of that playground.
-- The delete runs as the function owner because there is no delete policy on playground_versions.

create index if not exists playground_versions_playground_version_idx
  on public.playground_versions (playground_id, version_number desc);

create or replace function public.prune_playground_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.playground_versions v
   where v.playground_id = new.playground_id
     and v.id in (
       select id
         from public.playground_versions
        where playground_id = new.playground_id
        order by version_number desc, created_at desc
        offset 20
     );
  return null;
end;
$$;

revoke execute on function public.prune_playground_versions() from public, anon, authenticated;

drop trigger if exists trg_prune_playground_versions on public.playground_versions;
create trigger trg_prune_playground_versions
after insert on public.playground_versions
for each row execute function public.prune_playground_versions();

-- One-time cleanup of history saved before this migration.
delete from public.playground_versions v
 using (
   select id,
          row_number() over (partition by playground_id order by version_number desc, created_at desc) as rn
     from public.playground_versions
 ) ranked
 where v.id = ranked.id
   and ranked.rn > 20;
