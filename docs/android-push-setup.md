# Android / Web Push

The app stores browser Push subscriptions in `public.push_subs`. The active server sender is the Supabase Edge Function `bright-endpoint`; the database trigger `public.push_on_msg` calls it after each `msgs` INSERT and sends the message id as `{ "id": ... }`.

The sender never reads or transmits encrypted message contents. It sends a generic notification, excludes the sender, respects each member's muted setting, and removes expired subscriptions (HTTP 404/410).

## Runtime configuration

The deployed function expects these Edge Function environment variables:

- `VAPID_PUBLIC`: must exactly match `CFG.vapid` in `config.js`.
- `VAPID_PRIVATE`: the private key paired with that public key. It cannot be derived from the public key.
- `VAPID_SUBJECT`: contact URI, for example `mailto:admin@example.com`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: standard Supabase function environment values.

Do not generate a new VAPID key pair unless both the server private key and client public key are replaced together. Never commit private keys or the service-role key.

## Android verification

1. Install the TWA APK built for the same verified domain and signing certificate.
2. In Android Settings → Apps → the app → Notifications, allow notifications.
3. Open the app, sign in, and tap Settings → Notifications to grant browser permission and register the device.
4. Use the in-app test for local notification display. This does not prove remote push delivery.
5. Send a message from another account while the recipient app is backgrounded.

## Current project audit

- `bright-endpoint` is deployed and active; the database trigger has generated successful HTTP 200 invocations.
- The database currently contains 4 subscriptions across 2 users. The newest subscription was created on 2026-11-08.
- HTTP 200 from the Edge Function confirms invocation, not delivery to an Android device. Confirm remote delivery on a real device.
- The function is configured with JWT verification disabled because the database `pg_net` trigger calls it directly. This endpoint therefore needs a shared-secret authentication layer before production exposure; do not treat HTTP 200 as proof that this security gap is closed.
