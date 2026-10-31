-- Genre tags on a playground, picked in the New Playground and Edit Playground dialogs (safe to re-run).
-- Row-level security already limits updates to the owner, so no new policy is needed.
alter table public.playgrounds add column if not exists genres text[] not null default '{}';

-- Keep in step with GENRES in web/src/lib/cloud.ts.
alter table public.playgrounds drop constraint if exists playgrounds_genres_valid;
alter table public.playgrounds
  add constraint playgrounds_genres_valid check (
    genres <@ array[
      'rock', 'blues', 'metal', 'punk', 'indie', 'shoegaze', 'ambient', 'post_rock',
      'doom', 'jazz', 'funk', 'country', 'worship', 'pop', 'electronic', 'experimental'
    ]::text[]
  );
