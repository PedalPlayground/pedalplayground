-- "Featured on" for the Gear page: public gallery boards whose latest version uses a catalog item.
-- Same filters as gallery_boards (in the gallery, public, not hidden, no test accounts), most liked first.
-- Read only, and safe to run again.

create or replace function public.gear_featured_on(item_kind text, item_image text, max_items int default 12)
returns table (
  id uuid,
  slug text,
  name text,
  thumbnail text,
  updated_at timestamptz,
  username text,
  pedal_count int,
  like_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.thumbnail, p.updated_at, pr.username,
         coalesce(v.pedals, 0)::int,
         (select count(*) from public.gallery_likes l where l.playground_id = p.id)::int as likes
    from public.playgrounds p
    left join public.profiles pr on pr.user_id = p.owner_user_id
    join lateral (
      select pv.document,
             (select count(*) from jsonb_array_elements(pv.document -> 'items') i where i ->> 'kind' = 'pedal') as pedals
        from public.playground_versions pv
       where pv.playground_id = p.id
       order by pv.version_number desc
       limit 1
    ) v on true
   where p.in_gallery and p.is_public and p.slug is not null
     and not exists (select 1 from public.gallery_hidden h where h.playground_id = p.id)
     and not exists (select 1 from public.test_accounts t where t.user_id = p.owner_user_id)
     -- Boards save the image as its key ("boss-ds1") or, before the catalog moved, the file name ("boss-ds1.png").
     and exists (
       select 1 from jsonb_array_elements(v.document -> 'items') i
        where i ->> 'kind' = item_kind and i ->> 'image' in (item_image, item_image || '.png')
     )
   order by likes desc, p.updated_at desc, p.id desc
   limit least(greatest(max_items, 1), 24);
$$;

revoke execute on function public.gear_featured_on(text, text, int) from public;
grant execute on function public.gear_featured_on(text, text, int) to anon, authenticated;
