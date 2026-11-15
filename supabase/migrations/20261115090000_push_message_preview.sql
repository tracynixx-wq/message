-- Store a short plaintext preview only so push notifications can show the message text.
-- This field is intentionally separate from the encrypted message payload.
alter table public.msgs add column if not exists push_preview text;

comment on column public.msgs.push_preview is
  'Plaintext notification preview (up to 180 characters); exposed to push infrastructure when notifications are enabled.';
