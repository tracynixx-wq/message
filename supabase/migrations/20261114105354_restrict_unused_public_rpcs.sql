-- Restrict obsolete RPCs that have no current client or database callers.
-- Secret-message expiry is maintenance-only; the browser client must not trigger global deletion.
revoke all on function public.purge_secret() from public, anon, authenticated;
grant execute on function public.purge_secret() to service_role;

-- User lookup now uses the profiles table under its own RLS policies.
revoke all on function public.find_user(text) from public, anon, authenticated;
grant execute on function public.find_user(text) to service_role;

-- The singular add-member RPC has been replaced by the atomic multi-member RPC.
revoke all on function public.rotate_group_add_member_key(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rotate_group_add_member_key(uuid, uuid, jsonb) to service_role;
