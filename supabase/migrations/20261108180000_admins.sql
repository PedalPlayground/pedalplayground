-- Two roles. Admins (Trav, so far) do everything: they make and remove editors and post What's New. Editors update
-- the catalog, approve the queue and moderate. An admin counts as an editor everywhere. Safe to re-run.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
-- No policies: read only through is_admin().
alter table public.admins enable row level security;

-- The first admin: the account named trav.
insert into public.admins (user_id)
select user_id from public.profiles where lower(username) = 'trav'
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Admins are editors too.
create or replace function public.is_catalog_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.catalog_editors where user_id = auth.uid())
      or exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Admins make someone an editor, or stop them being one.
create or replace function public.set_editor(target uuid, make boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change permissions.' using errcode = '42501';
  end if;
  if make then
    insert into public.catalog_editors (user_id) values (target) on conflict (user_id) do nothing;
  else
    delete from public.catalog_editors where user_id = target;
  end if;
end;
$$;
revoke execute on function public.set_editor(uuid, boolean) from public, anon;
grant execute on function public.set_editor(uuid, boolean) to authenticated;

-- Admins: the editors (and admins), with usernames.
create or replace function public.list_editors()
returns table (user_id uuid, username text, added_at timestamptz, admin boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see that.' using errcode = '42501';
  end if;
  return query
    select e.user_id, p.username, e.added_at, exists (select 1 from public.admins a where a.user_id = e.user_id)
      from public.catalog_editors e
      left join public.profiles p on p.user_id = e.user_id
     order by e.added_at;
end;
$$;
revoke execute on function public.list_editors() from public, anon;
grant execute on function public.list_editors() to authenticated;

-- What's New is for admins to write (everyone still reads published posts).
drop policy if exists "announcements_select_signed_in" on public.announcements;
create policy "announcements_select_signed_in" on public.announcements for select to authenticated
  using (published_at <= now() or public.is_admin());

drop policy if exists "announcements_insert_editors" on public.announcements;
create policy "announcements_insert_editors" on public.announcements for insert to authenticated
  with check (public.is_admin());

drop policy if exists "announcements_update_editors" on public.announcements;
create policy "announcements_update_editors" on public.announcements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements_delete_editors" on public.announcements;
create policy "announcements_delete_editors" on public.announcements for delete to authenticated
  using (public.is_admin());
