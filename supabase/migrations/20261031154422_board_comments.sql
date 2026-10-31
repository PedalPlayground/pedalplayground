-- The board info panel and comments (safe to re-run). Needs the gallery_page migration first.
--
-- Comments are only on boards in the public gallery (not hidden by an editor). Taking a board out of the gallery,
-- unsharing it or turning comments off hides its comments from everyone but the owner; they come back with it.
-- Deleting a board or an account deletes its comments.

-- The owner's "Allow comments" switch, and when they last looked at their comments (for the new-comment count).
alter table public.playgrounds add column if not exists comments_off boolean not null default false;
alter table public.playgrounds add column if not exists comments_seen_at timestamptz;

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  playground_id uuid not null references public.playgrounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_board_idx on public.board_comments (playground_id, created_at);
create index if not exists board_comments_user_idx on public.board_comments (user_id, created_at desc);

-- No policies: read and written only through the functions below.
alter table public.board_comments enable row level security;

-- Whether a board is public in the gallery right now.
create or replace function public.board_in_gallery(board uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playgrounds p
     where p.id = board and p.in_gallery and p.is_public
       and not exists (select 1 from public.gallery_hidden h where h.playground_id = p.id)
  );
$$;
revoke execute on function public.board_in_gallery(uuid) from public, anon, authenticated;

-- What the info panel shows. Null (no row) when the board isn't shared and isn't the viewer's own.
create or replace function public.board_panel(board uuid)
returns table (
  name text,
  description text,
  playground_type text,
  username text,
  is_owner boolean,
  in_gallery boolean,
  comments_off boolean,
  comments_open boolean,
  like_count int,
  liked boolean,
  comment_count int,
  new_comments int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.description, p.playground_type, pr.username,
         coalesce(p.owner_user_id = auth.uid(), false),
         public.board_in_gallery(p.id),
         p.comments_off,
         public.board_in_gallery(p.id) and not p.comments_off,
         (select count(*) from public.gallery_likes l where l.playground_id = p.id)::int,
         exists (select 1 from public.gallery_likes l where l.playground_id = p.id and l.user_id = auth.uid()),
         (select count(*) from public.board_comments c where c.playground_id = p.id)::int,
         case when p.owner_user_id = auth.uid() then
           (select count(*) from public.board_comments c
             where c.playground_id = p.id and c.user_id <> p.owner_user_id
               and c.created_at > coalesce(p.comments_seen_at, '-infinity'))::int
         else 0 end
    from public.playgrounds p
    left join public.profiles pr on pr.user_id = p.owner_user_id
   where p.id = board and (p.is_public or p.owner_user_id = auth.uid());
$$;
revoke execute on function public.board_panel(uuid) from public;
grant execute on function public.board_panel(uuid) to anon, authenticated;

-- A board's comments, oldest first. Everyone sees them while comments are open; the owner always does.
create or replace function public.board_comments_list(board uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  username text,
  mine boolean,
  can_delete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.body, c.created_at, pr.username,
         coalesce(c.user_id = auth.uid(), false),
         coalesce(c.user_id = auth.uid() or p.owner_user_id = auth.uid(), false) or coalesce(public.is_catalog_editor(), false)
    from public.board_comments c
    join public.playgrounds p on p.id = c.playground_id
    left join public.profiles pr on pr.user_id = c.user_id
   where c.playground_id = board
     and ((public.board_in_gallery(board) and not p.comments_off) or coalesce(p.owner_user_id = auth.uid(), false))
   order by c.created_at
   limit 500;
$$;
revoke execute on function public.board_comments_list(uuid) from public;
grant execute on function public.board_comments_list(uuid) to anon, authenticated;

-- Post a comment. Signed-in people with a username, on gallery boards with comments on, at a sane pace.
create or replace function public.board_comment_add(board uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'username_required' using errcode = '42501';
  end if;
  if not public.board_in_gallery(board) or (select p.comments_off from public.playgrounds p where p.id = board) then
    raise exception 'comments_closed' using errcode = '42501';
  end if;
  if (select count(*) from public.board_comments where user_id = me and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.board_comments where user_id = me and created_at > now() - interval '1 day') >= 100 then
    raise exception 'slow_down' using errcode = '42501';
  end if;
  insert into public.board_comments (playground_id, user_id, body) values (board, me, btrim(body)) returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.board_comment_add(uuid, text) from public, anon;
grant execute on function public.board_comment_add(uuid, text) to authenticated;

-- Delete a comment: its author, the board's owner, or a catalog editor.
create or replace function public.board_comment_delete(comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.board_comments c
   using public.playgrounds p
   where c.id = comment and p.id = c.playground_id
     and (c.user_id = auth.uid() or p.owner_user_id = auth.uid() or public.is_catalog_editor());
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.board_comment_delete(uuid) from public, anon;
grant execute on function public.board_comment_delete(uuid) to authenticated;

-- The owner looked at their comments: reset the new-comment count.
create or replace function public.board_comments_seen(board uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.playgrounds set comments_seen_at = now() where id = board and owner_user_id = auth.uid();
$$;
revoke execute on function public.board_comments_seen(uuid) from public, anon;
grant execute on function public.board_comments_seen(uuid) to authenticated;

-- Gallery cards show a comment count too.
drop function if exists public.gallery_boards(text, text, text, int, int);
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
  liked boolean,
  comment_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.description, p.playground_type, p.thumbnail, p.updated_at, pr.username,
         coalesce(v.pedals, 0)::int,
         (select count(*) from public.gallery_likes l where l.playground_id = p.id)::int as likes,
         exists (select 1 from public.gallery_likes l where l.playground_id = p.id and l.user_id = auth.uid()),
         case when p.comments_off then 0 else (select count(*) from public.board_comments c where c.playground_id = p.id)::int end
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
