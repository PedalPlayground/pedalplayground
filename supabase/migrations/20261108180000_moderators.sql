-- Moderators: people who can moderate (reports, flags and timeouts, hiding boards and comments, bug reports) without
-- editing the catalog or posting What's New. Catalog editors can do everything moderators can, and only they can
-- make or remove moderators (Admin › Moderation › Look Up User). Safe to re-run.

create table if not exists public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  added_at timestamptz not null default now()
);
-- No policies: read and written only through the functions below.
alter table public.moderators enable row level security;

-- True for moderators and for catalog editors.
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_catalog_editor() or exists (select 1 from public.moderators where user_id = auth.uid());
$$;
revoke execute on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- Editors make someone a moderator, or stop them being one.
create or replace function public.set_moderator(target uuid, make boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only editors can do that.' using errcode = '42501';
  end if;
  if make then
    insert into public.moderators (user_id) values (target) on conflict (user_id) do nothing;
  else
    delete from public.moderators where user_id = target;
  end if;
end;
$$;
revoke execute on function public.set_moderator(uuid, boolean) from public, anon;
grant execute on function public.set_moderator(uuid, boolean) to authenticated;

-- Editors: the moderators, with their usernames.
create or replace function public.list_moderators()
returns table (user_id uuid, username text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only editors can do that.' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.username, m.added_at
      from public.moderators m
      left join public.profiles p on p.user_id = m.user_id
     order by m.added_at;
end;
$$;
revoke execute on function public.list_moderators() from public, anon;
grant execute on function public.list_moderators() to authenticated;

-- Let moderators into the moderation functions: rewrite each one's editor check as a moderator check, keeping the
-- rest of its current definition as it is.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'moderation_reports', 'moderation_user', 'moderation_flag', 'moderation_lift', 'moderation_close_report',
         'moderation_hidden_boards', 'moderation_activity', 'gallery_set_hidden', 'board_comment_delete',
         'board_comments_list'
       )
  loop
    def := pg_get_functiondef(f.oid);
    if position('is_catalog_editor()' in def) > 0 then
      execute replace(def, 'is_catalog_editor()', 'is_moderator()');
    end if;
  end loop;
end;
$$;

-- Bug reports: moderators read and close them too.
drop policy if exists "bug_reports_select_editors" on public.bug_reports;
create policy "bug_reports_select_editors" on public.bug_reports for select to authenticated
  using (public.is_moderator());

drop policy if exists "bug_reports_update_editors" on public.bug_reports;
create policy "bug_reports_update_editors" on public.bug_reports for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());
