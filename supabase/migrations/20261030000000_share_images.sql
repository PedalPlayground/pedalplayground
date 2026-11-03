-- Link previews for shared playgrounds (safe to re-run).
-- The app draws a 1200×630 JPEG of a shared board and stores it as share-images/<slug>.jpg. Social sites and chat
-- apps read it through the og:image tag that nginx fills in for ?p=<slug> links (docs/share-images.md).

-- Public read, served by Supabase's CDN. 2 MB is far more than a preview needs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-images', 'share-images', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Only the owner of the playground with that slug can write, replace or remove its image. (Upserts need select too.)
create or replace function public.owns_share_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playgrounds
    where slug = regexp_replace(object_name, '\.jpg$', '')
      and owner_user_id = auth.uid()
  );
$$;

drop policy if exists "share_images_insert_own" on storage.objects;
create policy "share_images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'share-images' and public.owns_share_image(name));

drop policy if exists "share_images_update_own" on storage.objects;
create policy "share_images_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'share-images' and public.owns_share_image(name))
  with check (bucket_id = 'share-images' and public.owns_share_image(name));

drop policy if exists "share_images_select_own" on storage.objects;
create policy "share_images_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'share-images' and public.owns_share_image(name));

drop policy if exists "share_images_delete_own" on storage.objects;
create policy "share_images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'share-images' and public.owns_share_image(name));
