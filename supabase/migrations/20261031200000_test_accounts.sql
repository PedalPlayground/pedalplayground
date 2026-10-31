-- Test accounts (safe to re-run).
-- Boards owned by a test account stay out of the public gallery unless the caller passes include_test,
-- which only beta and local builds do (VITE_SHOW_TEST_BOARDS). Prod keeps calling without it.
-- No RLS policies on purpose: only the SQL editor / service role can mark an account as a test account.
create table if not exists public.test_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.test_accounts enable row level security;

drop function if exists public.gallery_boards(text, text, text, integer, integer);
create or replace function public.gallery_boards(
  board_type text default null,
  search text default null,
  sort text default 'new',
  page_offset integer default 0,
  page_size integer default 24,
  include_test boolean default false
)
returns table(id uuid, slug text, name text, description text, playground_type text, thumbnail text, updated_at timestamptz,
              username text, pedal_count integer, like_count integer, liked boolean, comment_count integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
     and (include_test or not exists (select 1 from public.test_accounts t where t.user_id = p.owner_user_id))
     and (board_type is null or p.playground_type = board_type)
     and (search is null or search = '' or p.name ilike '%' || search || '%' or pr.username ilike '%' || search || '%')
   order by case when sort = 'liked' then (select count(*) from public.gallery_likes l where l.playground_id = p.id) end desc nulls last,
            p.updated_at desc, p.id desc
  offset greatest(page_offset, 0)
   limit least(greatest(page_size, 1), 60);
$function$;

