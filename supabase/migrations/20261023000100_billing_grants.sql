-- Tighten who can call the billing functions.
--
-- Supabase grants EXECUTE on new public-schema functions directly to the anon and authenticated roles,
-- so revoking from PUBLIC alone (as the billing migration did) isn't enough.
--   user_plan(uuid)           takes any user id -> server-side only
--   enforce_playground_limit  trigger function -> never called directly
--   my_entitlements()         for signed-in users only
revoke execute on function public.user_plan(uuid) from public, anon, authenticated;
grant execute on function public.user_plan(uuid) to service_role;

revoke execute on function public.enforce_playground_limit() from public, anon, authenticated;

revoke execute on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated, service_role;
