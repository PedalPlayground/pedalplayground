-- Billing, plans and playground limits.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- Model:
--   plan_limits    what each plan allows (edit the numbers here; no deploy needed)
--   subscriptions  one row per user, written ONLY by the Stripe webhook (service role)
--   user_plan()    'pro' while a subscription is active, else 'free'
--   trigger        blocks creating a playground past the plan's limit (HTTP 402 via PostgREST)
--   my_entitlements()  what the app reads to show plan, usage and upgrade prompts

-- ---------------------------------------------------------------------------
-- Plan limits
-- ---------------------------------------------------------------------------
create table if not exists public.plan_limits (
  plan text primary key,
  -- null means unlimited
  max_playgrounds integer check (max_playgrounds is null or max_playgrounds >= 0)
);

insert into public.plan_limits (plan, max_playgrounds)
values ('free', 1), ('pro', null)
on conflict (plan) do nothing;

alter table public.plan_limits enable row level security;

drop policy if exists "plan_limits_read" on public.plan_limits;
create policy "plan_limits_read" on public.plan_limits for select using (true);

-- ---------------------------------------------------------------------------
-- Subscriptions (mirrors Stripe; clients can read their own row, never write)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- nullable so a plan can be granted by hand (see "Comping a user" in docs/billing.md)
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions for select
using (user_id = auth.uid());
-- No insert/update/delete policies on purpose: only the service role (Edge Functions) writes.

-- ---------------------------------------------------------------------------
-- Plan resolution
-- ---------------------------------------------------------------------------
-- 'past_due' keeps Pro while Stripe retries the payment. The 3 day grace after the period end covers
-- a late renewal webhook so a paying customer is never briefly downgraded.
create or replace function public.user_plan(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
        from public.subscriptions s
       where s.user_id = uid
         and s.status in ('active', 'trialing', 'past_due')
         and (s.current_period_end is null or s.current_period_end + interval '3 days' > now())
    ) then 'pro'
    else 'free'
  end;
$$;

-- Not granted to signed-in users: it takes any user id, so exposing it would let one user look up another's
-- plan. The trigger and my_entitlements() are security definer, so they can still call it.
revoke all on function public.user_plan(uuid) from public;
grant execute on function public.user_plan(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Enforcement: refuse to create a playground past the plan limit
-- ---------------------------------------------------------------------------
-- Existing playgrounds are never removed or locked (for example after a downgrade); only creating new
-- ones is blocked. SQLSTATE 'PT402' makes PostgREST answer HTTP 402 with message 'playground_limit_reached'.
create or replace function public.enforce_playground_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_name text;
  max_n integer;
  n integer;
begin
  -- Serialize concurrent inserts for one owner so two tabs can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext(new.owner_user_id::text));

  plan_name := public.user_plan(new.owner_user_id);
  select max_playgrounds into max_n from public.plan_limits where plan = plan_name;
  if max_n is null then
    return new;
  end if;

  select count(*) into n from public.playgrounds where owner_user_id = new.owner_user_id;
  if n >= max_n then
    raise exception 'playground_limit_reached'
      using errcode = 'PT402',
            detail = format('plan=%s limit=%s count=%s', plan_name, max_n, n),
            hint = 'Upgrade to create more playgrounds.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_playground_limit on public.playgrounds;
create trigger trg_enforce_playground_limit
before insert on public.playgrounds
for each row execute function public.enforce_playground_limit();

-- ---------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------
create or replace function public.my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', public.user_plan(auth.uid()),
    'max_playgrounds', (select max_playgrounds from public.plan_limits where plan = public.user_plan(auth.uid())),
    'playground_count', (select count(*) from public.playgrounds where owner_user_id = auth.uid()),
    'status', (select status from public.subscriptions where user_id = auth.uid()),
    'current_period_end', (select current_period_end from public.subscriptions where user_id = auth.uid()),
    'cancel_at_period_end', coalesce((select cancel_at_period_end from public.subscriptions where user_id = auth.uid()), false)
  );
$$;

revoke all on function public.my_entitlements() from public;
grant execute on function public.my_entitlements() to authenticated;
