import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-webhook-secret") !== expected) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  if (!url || !serviceKey || !publicKey || !privateKey) return json({ error: "push_secrets_missing" }, 500);

  let event: any;
  try { event = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (event?.type !== "INSERT" || event?.table !== "msgs") return json({ ignored: true });
  const message = event.record;
  const convId = message?.conv_id;
  const senderId = message?.sender;
  if (!convId || !senderId) return json({ error: "message_record_missing_conv_or_sender" }, 400);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const members = await supabase.from("members").select("user_id").eq("conv_id", convId).neq("user_id", senderId);
  if (members.error) return json({ error: "members_lookup_failed", detail: members.error.message }, 500);
  const recipients = [...new Set((members.data ?? []).map((row) => row.user_id).filter(Boolean))];
  if (!recipients.length) return json({ sent: 0, expired: 0 });

  const subscriptions = await supabase.from("push_subs").select("endpoint,sub,user_id").in("user_id", recipients);
  if (subscriptions.error) return json({ error: "subscriptions_lookup_failed", detail: subscriptions.error.message }, 500);

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({ title: "Новое сообщение", body: "Вам пришло новое сообщение", conv: convId });
  let sent = 0, expired = 0, failed = 0;
  await Promise.all((subscriptions.data ?? []).map(async (row) => {
    try {
      await webpush.sendNotification(row.sub, payload, { TTL: 60, urgency: "high" });
      sent++;
    } catch (error) {
      const status = (error as any)?.statusCode;
      if (status === 404 || status === 410) {
        const removed = await supabase.from("push_subs").delete().eq("endpoint", row.endpoint);
        if (!removed.error) expired++;
      } else {
        failed++;
        console.error("Web Push delivery failed", status ?? "unknown", String(error));
      }
    }
  }));
  return json({ sent, expired, failed, recipients: recipients.length });
});
