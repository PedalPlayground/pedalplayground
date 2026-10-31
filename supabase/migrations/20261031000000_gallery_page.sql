-- The public gallery page at /gallery/ (safe to re-run). Needs the playground_gallery and profiles migrations first.
--
-- Boards appear as soon as their owner turns on "Show in Public Gallery". Catalog editors can hide a board;
-- a hidden board stays shared (its link keeps working) but never shows in the gallery, even if the owner
-- turns the switch off and on again.

create table if not exists public.gallery_hidden (
  playground_id uuid primary key references public.playgrounds (id) on delete cascade,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_at timestamptz not null default now()
);

-- No policies: only the functions below read or write it.
alter table public.gallery_hidden enable row level security;

-- One page of gallery boards, most recently updated first. Pass the last row's updated_at and id to get the next page.
create or replace function public.gallery_boards(
  board_type text default null,
  search text default null,
  before_updated timestamptz default null,
  before_id uuid default null,
  page_size int default 24
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  playground_type text,
  thumbnail text,
  updated_at timestamptz,
  username text,
  pedal_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.description, p.playground_type, p.thumbnail, p.updated_at, pr.username,
         coalesce(v.pedals, 0)::int
    from public.playgrounds p
    left join public.profiles pr on pr.user_id = p.owner_user_id
    left join lateral (
      select (select count(*) from jsonb_array_elements(pv.document -> 'items') i where i ->> 'kind' = 'pedal') as pedals
        from public.playground_versions pv
       where pv.playground_id = p.id
       order by pv.version_number desc
       limit 1
    ) v on true
   where p.in_gallery and p.is_public and p.slug is not null
     and not exists (select 1 from public.gallery_hidden h where h.playground_id = p.id)
     and (board_type is null or p.playground_type = board_type)
     and (search is null or search = '' or p.name ilike '%' || search || '%' or pr.username ilike '%' || search || '%')
     and (before_updated is null or (p.updated_at, p.id) < (before_updated, before_id))
   order by p.updated_at desc, p.id desc
   limit least(greatest(page_size, 1), 60);
$$;

revoke execute on function public.gallery_boards(text, text, timestamptz, uuid, int) from public;
grant execute on function public.gallery_boards(text, text, timestamptz, uuid, int) to anon, authenticated;

-- Hide a board from the gallery, or show it again. Catalog editors only.
create or replace function public.gallery_set_hidden(board uuid, hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only editors can hide gallery boards.' using errcode = '42501';
  end if;
  if hidden then
    insert into public.gallery_hidden (playground_id, hidden_by) values (board, auth.uid())
      on conflict (playground_id) do nothing;
  else
    delete from public.gallery_hidden where playground_id = board;
  end if;
end;
$$;

revoke execute on function public.gallery_set_hidden(uuid, boolean) from public, anon;
grant execute on function public.gallery_set_hidden(uuid, boolean) to authenticated;
