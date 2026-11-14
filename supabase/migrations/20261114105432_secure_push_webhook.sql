-- Store a random shared secret in Supabase Vault for the DB-to-Edge-Function webhook.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'message_push_webhook_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'message_push_webhook_secret',
      'Authenticates msgs INSERT requests sent by the notify_msg trigger to bright-endpoint'
    );
  end if;
end
$$;

create or replace function public.verify_push_webhook_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select p_secret is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'message_push_webhook_secret'
      and decrypted_secret = p_secret
  );
$function$;
revoke all on function public.verify_push_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.verify_push_webhook_secret(text) to service_role;

create or replace function public.notify_msg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'message_push_webhook_secret';

  if v_secret is null then
    raise warning 'Push webhook secret is missing; notification skipped';
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://wvxqazbylxttjrvyussq.supabase.co/functions/v1/bright-endpoint',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object('id', new.id)
    );
  exception when others then
    raise warning 'Push webhook request could not be queued: %', sqlerrm;
  end;
  return new;
end
$function$;
revoke all on function public.notify_msg() from public, anon, authenticated;