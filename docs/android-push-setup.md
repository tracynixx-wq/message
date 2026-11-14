# Android / Web Push setup

The client can create and store a browser Push subscription, but notifications do not reach other devices until this server-side sender is deployed and connected to the `msgs` INSERT event.

## Required secrets

The current client VAPID public key is in `config.js`. The server's `VAPID_PRIVATE_KEY` **must be the matching private key**. It cannot be derived from the public key. Do not generate a new private key unless you also replace `CFG.vapid` with its matching public key and resubscribe devices.

Set these secrets in the Supabase project whose URL is configured in `config.js`:

- `PUSH_WEBHOOK_SECRET`: a long random secret used by the database webhook header.
- `VAPID_PUBLIC_KEY`: exact value of `CFG.vapid` in `config.js`.
- `VAPID_PRIVATE_KEY`: matching private VAPID key (not present in this repository).
- `VAPID_SUBJECT`: a contact URI such as `mailto:you@example.com`.

Also configure the standard Supabase Edge Function secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the platform normally provides these to deployed functions).

## Deploy

From the repository root, after linking the correct Supabase project:

```sh
supabase secrets set PUSH_WEBHOOK_SECRET='YOUR_RANDOM_SECRET' VAPID_PUBLIC_KEY='PUBLIC_KEY_FROM_CONFIG' VAPID_PRIVATE_KEY='MATCHING_PRIVATE_KEY' VAPID_SUBJECT='mailto:you@example.com'
supabase functions deploy push-notify --no-verify-jwt
```

Never commit the private key, service-role key, or webhook secret.

## Connect message inserts

In the Supabase Dashboard for the same project as `config.js`, create a Database Webhook:
- Table: `public.msgs`
- Event: `INSERT`
- Method: `POST`
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/push-notify`
- Header: `Content-Type: application/json`
- Header: `x-webhook-secret: YOUR_RANDOM_SECRET`

The function notifies all conversation members except the sender. Notification text is generic and does not expose encrypted message contents. Expired endpoints (HTTP 404/410) are removed automatically.

## Android checks

1. Install/update the TWA APK built for the same verified domain and signing certificate.
2. In Android Settings → Apps → the app → Notifications, allow notifications.
3. Open the app, sign in, and tap Settings → Notifications to grant browser permission and register this device.
4. Use the in-app test to verify local notification display. This test does **not** prove remote push delivery; remote delivery requires the webhook and matching VAPID key above.
5. Send a message from a different account while the recipient app is backgrounded.

If the current VAPID private key is unavailable, remote push cannot be activated with the existing public key; recover the matching key or rotate both public and private keys together.
