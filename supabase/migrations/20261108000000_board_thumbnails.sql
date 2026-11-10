-- Sharp board thumbnails as image files (safe to re-run).
-- The app draws a 720×450 picture of a playground (2× the cards' size, for retina screens) and stores it as
-- board-thumbnails/<playground id>.webp (or .png where the browser can't encode WebP). playgrounds.thumbnail then holds
-- the file's public URL with a ?v= version instead of an inline data URL, so Explore and the playground menus load
-- small rows and cacheable, lazy images. Old rows with data URLs keep working until their next save.

-- Public read, served by Supabase's CDN. 1 MB is far more than a thumbnail needs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-thumbnails', 'board-thumbnails', true, 1048576, array['image/webp', 'image/png'])
on conflict (id) do nothing;

-- The owner of the playground can write its thumbnail. Catalog editors can too, for gallery boards only, so the
-- existing gallery can be redrawn once (Editor, Moderation: Redraw gallery thumbnails).
create or replace function public.can_write_board_thumbnail(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playgrounds p
    where p.id::text = regexp_replace(object_name, '\.(webp|png)$', '')
      and (
        p.owner_user_id = auth.uid()
        or (p.in_gallery and p.is_public and public.is_catalog_editor())
      )
  );
$$;

revoke execute on function public.can_write_board_thumbnail(text) from public, anon;
grant execute on function public.can_write_board_thumbnail(text) to authenticated;

drop policy if exists "board_thumbnails_insert" on storage.objects;
create policy "board_thumbnails_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'board-thumbnails' and public.can_write_board_thumbnail(name));

drop policy if exists "board_thumbnails_update" on storage.objects;
create policy "board_thumbnails_update" on storage.objects for update to authenticated
  using (bucket_id = 'board-thumbnails' and public.can_write_board_thumbnail(name))
  with check (bucket_id = 'board-thumbnails' and public.can_write_board_thumbnail(name));

-- Upserts need select too.
drop policy if exists "board_thumbnails_select" on storage.objects;
create policy "board_thumbnails_select" on storage.objects for select to authenticated
  using (bucket_id = 'board-thumbnails' and public.can_write_board_thumbnail(name));

drop policy if exists "board_thumbnails_delete" on storage.objects;
create policy "board_thumbnails_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'board-thumbnails' and public.can_write_board_thumbnail(name));

-- Editors point a gallery board's thumbnail at its redrawn file. Only a URL in this bucket, for that board.
create or replace function public.set_gallery_thumbnail(playground_id uuid, url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only editors can do that.';
  end if;
  if url !~ ('/storage/v1/object/public/board-thumbnails/' || playground_id::text || '\.(webp|png)(\?v=\d+)?$') then
    raise exception 'That isn''t this board''s thumbnail.';
  end if;
  -- Leaves updated_at alone, so Explore's Newest order doesn't change.
  update public.playgrounds set thumbnail = url where id = playground_id and in_gallery and is_public;
end;
$$;

revoke execute on function public.set_gallery_thumbnail(uuid, text) from public, anon;
grant execute on function public.set_gallery_thumbnail(uuid, text) to authenticated;
