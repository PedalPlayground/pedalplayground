-- Public profiles: the username chosen at sign-up (safe to re-run).
-- Usernames are public (they show on shared playgrounds), so anyone can read them; only the owner can change theirs.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  -- Keep in step with USERNAME_PATTERN in web/src/lib/profiles.ts.
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_-]{3,24}$')
);

-- Unique regardless of case: "ToneChaser" and "tonechaser" are the same name.
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (user_id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sign-up passes the username in the user's metadata; create the profile in the same transaction.
-- Accounts made before this (or a name that doesn't fit the format) get no profile and are asked to pick one.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := new.raw_user_meta_data ->> 'username';
begin
  if name is not null and name ~ '^[A-Za-z0-9_-]{3,24}$' then
    insert into public.profiles (user_id, username) values (new.id, name);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Lets the sign-up form check a name before submitting, case-insensitively.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
