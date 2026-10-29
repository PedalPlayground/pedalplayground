-- Details the owner sets in the Edit Playground dialog: a short description and the kind of board (safe to re-run).
-- Row-level security already limits updates to the owner, so no new policy is needed.
alter table public.playgrounds add column if not exists description text;
alter table public.playgrounds add column if not exists playground_type text;

alter table public.playgrounds drop constraint if exists playgrounds_description_length;
alter table public.playgrounds
  add constraint playgrounds_description_length check (description is null or char_length(description) <= 500);

-- Keep in step with PLAYGROUND_TYPES in web/src/lib/cloud.ts.
alter table public.playgrounds drop constraint if exists playgrounds_type_valid;
alter table public.playgrounds
  add constraint playgrounds_type_valid check (
    playground_type is null or playground_type in ('guitar', 'bass', 'synth', 'collection', 'other')
  );
