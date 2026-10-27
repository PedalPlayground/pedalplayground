-- A short description the owner writes in the Edit Playground dialog (safe to re-run).
-- Row-level security already limits updates to the owner, so no new policy is needed.
alter table public.playgrounds add column if not exists description text;

alter table public.playgrounds drop constraint if exists playgrounds_description_length;
alter table public.playgrounds
  add constraint playgrounds_description_length check (description is null or char_length(description) <= 500);
