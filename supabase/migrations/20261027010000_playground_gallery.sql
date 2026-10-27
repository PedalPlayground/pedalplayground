-- "Show in Public Gallery" from the Edit Playground dialog (safe to re-run).
-- A gallery board must also be readable by everyone, so in_gallery requires is_public (the share flag).
alter table public.playgrounds add column if not exists in_gallery boolean not null default false;

alter table public.playgrounds drop constraint if exists playgrounds_gallery_is_public;
alter table public.playgrounds
  add constraint playgrounds_gallery_is_public check (not in_gallery or is_public);

-- For the future gallery page: newest public boards first.
create index if not exists playgrounds_gallery_idx
  on public.playgrounds (updated_at desc) where in_gallery;
