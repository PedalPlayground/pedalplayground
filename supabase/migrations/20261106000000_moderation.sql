-- Moderation (safe to re-run). Needs the catalog (is_catalog_editor), gallery_page and board_comments migrations first.
--
-- Catalog editors flag accounts that break the rules: a warning, a timeout (no commenting, liking, sharing to the
-- gallery, username changes, reports or catalog suggestions until it ends) or a ban (no sign-in; their gallery boards
-- and comments are hidden). The flagged person sees each new flag once, on their next visit. Players report comments,
-- boards and users; reports wait in the editor's Moderation tab.
--
-- Reasons are short codes; the app shows their labels (web/src/lib/moderation.ts). Keep the lists in step.

create table if not exists public.user_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'sexual', 'offensive_name', 'impersonation', 'other')),
  -- Shown to the person flagged.
  note text not null default '' check (char_length(note) <= 1000),
  action text not null check (action in ('warning', 'timeout', 'ban')),
  -- Timeouts only.
  ends_at timestamptz,
  issued_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- When the person saw it (the popup's "I Understand").
  seen_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references auth.users (id) on delete set null,
  constraint user_flags_timeout_ends check ((action = 'timeout') = (ends_at is not null))
);
create index if not exists user_flags_by_user_idx on public.user_flags (user_id, created_at desc);
-- No policies: only the functions below read or write it.
alter table public.user_flags enable row level security;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('comment', 'board', 'user')),
  -- A comment or board id, or a username.
  target_id text not null check (char_length(target_id) between 1 and 100),
  target_user_id uuid references auth.users (id) on delete cascade,
  -- What was reported, as it was then (comment text, board name or username), so the report outlives edits.
  target_text text,
  reason text not null check (reason in ('spam', 'harassment', 'sexual', 'offensive_name', 'impersonation', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz
);
-- One open report per person per thing.
create unique index if not exists content_reports_open_once_idx on public.content_reports (reporter_id, target_kind, target_id) where status = 'open';
create index if not exists content_reports_open_idx on public.content_reports (created_at) where status = 'open';
alter table public.content_reports enable row level security;

-- Boards hidden by a ban come back when it's lifted (editors' own hides stay).
alter table public.gallery_hidden add column if not exists flag_id uuid references public.user_flags (id) on delete set null;

-- Helpers ------------------------------------------------------------------------------------------------------------

create or replace function public.user_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_flags f where f.user_id = uid and f.action = 'ban' and f.lifted_at is null);
$$;
revoke execute on function public.user_banned(uuid) from public, anon, authenticated;

-- Banned, or in a timeout that hasn't ended.
create or replace function public.user_restricted(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_flags f
     where f.user_id = uid and f.lifted_at is null
       and (f.action = 'ban' or (f.action = 'timeout' and f.ends_at > now()))
  );
$$;
revoke execute on function public.user_restricted(uuid) from public, anon, authenticated;

-- Usernames with common curse words or slurs (also blocks leetspeak like "sh1t"). Keep in step with
-- web/src/lib/profanity.ts. Short words that hide inside ordinary ones (cock, dick, ass) only count on their own.
create or replace function public.username_offensive(name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with n as (select translate(lower(name), '013457@$!', 'oieastasi') as s)
  select (select s from n) ~ '(fuck|fuk|shit|cunt|nigg|fagg|bitch|whore|slut|twat|wank|retard|asshole|pussy|motherf|dickhead|cocksuck|rapist|nazi)'
      or exists (
        select 1 from regexp_split_to_table((select s from n), '[-_]+') as t
         where t in ('fag', 'fags', 'dick', 'dicks', 'cock', 'cocks', 'ass', 'tit', 'tits', 'prick', 'piss', 'cum', 'jizz', 'kys')
      );
$$;

-- Guards -------------------------------------------------------------------------------------------------------------

-- Restricted accounts can't comment, like, share a board to the gallery, change their username, report or suggest.
create or replace function public.guard_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(new);
  who uuid := coalesce(row_json ->> 'user_id', row_json ->> 'submitted_by', row_json ->> 'reporter_id', row_json ->> 'owner_user_id')::uuid;
begin
  if tg_table_name = 'playgrounds' then
    -- Only turning on "Show in Public Gallery" is held back.
    if not coalesce((row_json ->> 'in_gallery')::boolean, false) then return new; end if;
    if tg_op = 'UPDATE' and coalesce((to_jsonb(old) ->> 'in_gallery')::boolean, false) then return new; end if;
  end if;
  if who is not null and public.user_restricted(who) then
    raise exception 'account_restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_restricted on public.board_comments;
create trigger guard_restricted before insert on public.board_comments for each row execute function public.guard_restricted();
drop trigger if exists guard_restricted on public.gallery_likes;
create trigger guard_restricted before insert on public.gallery_likes for each row execute function public.guard_restricted();
drop trigger if exists guard_restricted on public.catalog_submissions;
create trigger guard_restricted before insert on public.catalog_submissions for each row execute function public.guard_restricted();
drop trigger if exists guard_restricted on public.content_reports;
create trigger guard_restricted before insert on public.content_reports for each row execute function public.guard_restricted();
drop trigger if exists guard_restricted on public.playgrounds;
create trigger guard_restricted before insert or update of in_gallery on public.playgrounds for each row execute function public.guard_restricted();

-- Usernames: no curse words, and no changes while restricted.
create or replace function public.guard_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.username = old.username then return new; end if;
  if public.username_offensive(new.username) then
    raise exception 'username_not_allowed' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and public.user_restricted(new.user_id) then
    raise exception 'account_restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_username on public.profiles;
create trigger guard_username before insert or update of username on public.profiles for each row execute function public.guard_username();

-- Banned accounts' comments are hidden (same as board_comments.sql otherwise).
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
     and not public.user_banned(c.user_id)
   order by c.created_at
   limit 500;
$$;
revoke execute on function public.board_comments_list(uuid) from public;
grant execute on function public.board_comments_list(uuid) to anon, authenticated;

-- For the signed-in person ----------------------------------------------------------------------------------------

-- Their standing: banned, when a timeout ends, and flags they haven't seen yet (newest first).
create or replace function public.my_standing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'banned', public.user_banned(auth.uid()),
    'restricted_until', (select max(f.ends_at) from public.user_flags f
                          where f.user_id = auth.uid() and f.action = 'timeout' and f.lifted_at is null and f.ends_at > now()),
    'unseen', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'reason', f.reason, 'note', f.note, 'action', f.action,
                                                            'ends_at', f.ends_at, 'created_at', f.created_at) order by f.created_at desc)
                          from public.user_flags f
                         where f.user_id = auth.uid() and f.seen_at is null and f.lifted_at is null), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;
revoke execute on function public.my_standing() from public, anon;
grant execute on function public.my_standing() to authenticated;

create or replace function public.flags_seen(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_flags set seen_at = now() where user_id = auth.uid() and id = any (ids) and seen_at is null;
$$;
revoke execute on function public.flags_seen(uuid[]) from public, anon;
grant execute on function public.flags_seen(uuid[]) to authenticated;

-- Report a comment (its id), a board (its id) or a user (their username). Returns the report's id, or null when this
-- person already has an open report on it.
create or replace function public.report_content(kind text, target text, reason text, details text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  who uuid;
  snapshot text;
  new_id uuid;
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if (select count(*) from public.content_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'slow_down' using errcode = '42501';
  end if;
  if kind = 'comment' then
    select c.user_id, c.body into who, snapshot from public.board_comments c where c.id::text = target;
  elsif kind = 'board' then
    select p.owner_user_id, p.name into who, snapshot from public.playgrounds p where p.id::text = target and p.is_public;
  elsif kind = 'user' then
    select pr.user_id, pr.username into who, snapshot from public.profiles pr where lower(pr.username) = lower(target);
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if who is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if who = me then
    raise exception 'own_content' using errcode = '22023';
  end if;
  insert into public.content_reports (reporter_id, target_kind, target_id, target_user_id, target_text, reason, details)
  values (me, kind, target, who, left(snapshot, 1000), reason, left(coalesce(btrim(details), ''), 1000))
  on conflict do nothing
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.report_content(text, text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text, text) to authenticated;

-- For editors --------------------------------------------------------------------------------------------------------

-- Open reports (or the latest closed ones too), oldest first, with who's reported and how often.
create or replace function public.moderation_reports(include_closed boolean default false)
returns table (
  id uuid,
  target_kind text,
  target_id text,
  target_text text,
  target_user_id uuid,
  target_username text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_username text,
  open_against bigint,
  flags_against bigint,
  -- The board (or the comment's board) to open, by its share slug.
  board_slug text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  return query
    select r.id, r.target_kind, r.target_id, r.target_text, r.target_user_id, tp.username, r.reason, r.details, r.status,
           r.created_at, rp.username,
           (select count(*) from public.content_reports o where o.target_user_id = r.target_user_id and o.status = 'open'),
           (select count(*) from public.user_flags f where f.user_id = r.target_user_id and f.lifted_at is null),
           case r.target_kind
             when 'board' then (select p.slug from public.playgrounds p where p.id::text = r.target_id)
             when 'comment' then (select p.slug from public.board_comments c join public.playgrounds p on p.id = c.playground_id
                                   where c.id::text = r.target_id)
           end
      from public.content_reports r
      left join public.profiles tp on tp.user_id = r.target_user_id
      left join public.profiles rp on rp.user_id = r.reporter_id
     where r.status = 'open' or (include_closed and r.created_at > now() - interval '30 days')
     order by (r.status = 'open') desc, r.created_at
     limit 200;
end;
$$;
revoke execute on function public.moderation_reports(boolean) from public, anon;
grant execute on function public.moderation_reports(boolean) to authenticated;

-- One account by username: its standing and every flag, newest first.
create or replace function public.moderation_user(name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  who uuid;
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  select pr.user_id into who from public.profiles pr where lower(pr.username) = lower(btrim(name));
  if who is null then
    return null;
  end if;
  return jsonb_build_object(
    'user_id', who,
    'username', (select username from public.profiles where user_id = who),
    'joined', (select created_at from public.profiles where user_id = who),
    'banned', public.user_banned(who),
    'restricted_until', (select max(f.ends_at) from public.user_flags f
                          where f.user_id = who and f.action = 'timeout' and f.lifted_at is null and f.ends_at > now()),
    'open_reports', (select count(*) from public.content_reports r where r.target_user_id = who and r.status = 'open'),
    'flags', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', f.id, 'reason', f.reason, 'note', f.note, 'action', f.action, 'ends_at', f.ends_at,
                 'created_at', f.created_at, 'seen_at', f.seen_at, 'lifted_at', f.lifted_at,
                 'issued_by', (select username from public.profiles where user_id = f.issued_by)) order by f.created_at desc)
               from public.user_flags f where f.user_id = who), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.moderation_user(text) from public, anon;
grant execute on function public.moderation_user(text) to authenticated;

-- Flag an account. A ban also blocks sign-in (and ends their sessions) and hides their gallery boards. `report`
-- resolves that report.
create or replace function public.moderation_flag(target uuid, reason text, note text, action text, days int default null, report uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_id uuid;
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'own_account' using errcode = '22023';
  end if;
  if action = 'timeout' and (days is null or days not between 1 and 365) then
    raise exception 'bad_days' using errcode = '22023';
  end if;
  insert into public.user_flags (user_id, reason, note, action, ends_at)
  values (target, reason, left(coalesce(btrim(note), ''), 1000), action,
          case when action = 'timeout' then now() + make_interval(days => days) end)
  returning id into new_id;

  if action = 'ban' then
    -- A far-off date rather than 'infinity', which Supabase Auth can't read.
    update auth.users set banned_until = '2999-12-31 00:00:00+00' where id = target;
    delete from auth.sessions where user_id = target;
    insert into public.gallery_hidden (playground_id, hidden_by, flag_id)
    select p.id, auth.uid(), new_id from public.playgrounds p where p.owner_user_id = target and p.in_gallery
    on conflict (playground_id) do nothing;
  end if;

  if report is not null then
    update public.content_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
     where id = report and status = 'open';
  end if;
  return new_id;
end;
$$;
revoke execute on function public.moderation_flag(uuid, text, text, text, int, uuid) from public, anon;
grant execute on function public.moderation_flag(uuid, text, text, text, int, uuid) to authenticated;

-- Lift a flag: a timeout ends now, a ban lets them sign in again and brings back the boards it hid.
create or replace function public.moderation_lift(flag uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  who uuid;
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  update public.user_flags set lifted_at = now(), lifted_by = auth.uid()
   where id = flag and lifted_at is null
  returning user_id into who;
  if who is null then
    return;
  end if;
  delete from public.gallery_hidden where flag_id = flag;
  if not public.user_banned(who) then
    update auth.users set banned_until = null where id = who;
  end if;
end;
$$;
revoke execute on function public.moderation_lift(uuid) from public, anon;
grant execute on function public.moderation_lift(uuid) to authenticated;

create or replace function public.moderation_close_report(report uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  if outcome not in ('resolved', 'dismissed') then
    raise exception 'bad_outcome' using errcode = '22023';
  end if;
  update public.content_reports set status = outcome, resolved_by = auth.uid(), resolved_at = now() where id = report;
end;
$$;
revoke execute on function public.moderation_close_report(uuid, text) from public, anon;
grant execute on function public.moderation_close_report(uuid, text) to authenticated;

-- Boards hidden from the gallery (by an editor, or by a ban), newest first, for the Moderation tab's feed.
create or replace function public.moderation_hidden_boards()
returns table (
  playground_id uuid,
  slug text,
  name text,
  owner_user_id uuid,
  owner_username text,
  hidden_by_username text,
  hidden_at timestamptz,
  by_ban boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  return query
    select h.playground_id, p.slug, p.name, p.owner_user_id, op.username, hp.username, h.hidden_at, h.flag_id is not null
      from public.gallery_hidden h
      join public.playgrounds p on p.id = h.playground_id
      left join public.profiles op on op.user_id = p.owner_user_id
      left join public.profiles hp on hp.user_id = h.hidden_by
     order by h.hidden_at desc
     limit 200;
end;
$$;
revoke execute on function public.moderation_hidden_boards() from public, anon;
grant execute on function public.moderation_hidden_boards() to authenticated;
