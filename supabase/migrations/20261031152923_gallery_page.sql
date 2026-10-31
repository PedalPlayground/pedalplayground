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

-- Likes: one per person per board. Read and written only through the functions below.
create table if not exists public.gallery_likes (
  playground_id uuid not null references public.playgrounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (playground_id, user_id)
);
alter table public.gallery_likes enable row level security;

-- An earlier draft of gallery_boards took different arguments.
drop function if exists public.gallery_boards(text, text, timestamptz, uuid, int);

-- One page of gallery boards: sort 'new' (most recently updated) or 'liked' (most likes, then newest).
-- `liked` says whether the signed-in viewer likes the board (always false when signed out).
create or replace function public.gallery_boards(
  board_type text default null,
  search text default null,
  sort text default 'new',
  page_offset int default 0,
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
  pedal_count int,
  like_count int,
  liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.description, p.playground_type, p.thumbnail, p.updated_at, pr.username,
         coalesce(v.pedals, 0)::int,
         (select count(*) from public.gallery_likes l where l.playground_id = p.id)::int as likes,
         exists (select 1 from public.gallery_likes l where l.playground_id = p.id and l.user_id = auth.uid())
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
   order by case when sort = 'liked' then (select count(*) from public.gallery_likes l where l.playground_id = p.id) end desc nulls last,
            p.updated_at desc, p.id desc
  offset greatest(page_offset, 0)
   limit least(greatest(page_size, 1), 60);
$$;

revoke execute on function public.gallery_boards(text, text, text, int, int) from public;
grant execute on function public.gallery_boards(text, text, text, int, int) to anon, authenticated;

-- Like or unlike a gallery board. Signed-in people only. Returns the board's new like count.
create or replace function public.gallery_set_like(board uuid, liked boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Sign in to like boards.' using errcode = '42501';
  end if;
  if liked then
    if not exists (select 1 from public.playgrounds p where p.id = board and p.in_gallery and p.is_public) then
      raise exception 'That board is not in the gallery.' using errcode = 'P0002';
    end if;
    insert into public.gallery_likes (playground_id, user_id) values (board, auth.uid()) on conflict do nothing;
  else
    delete from public.gallery_likes where playground_id = board and user_id = auth.uid();
  end if;
  select count(*) into n from public.gallery_likes where playground_id = board;
  return n;
end;
$$;

revoke execute on function public.gallery_set_like(uuid, boolean) from public, anon;
grant execute on function public.gallery_set_like(uuid, boolean) to authenticated;

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
