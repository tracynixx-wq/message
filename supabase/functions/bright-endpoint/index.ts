// Push notifications for encrypted messages. Message bodies are never sent to the push provider.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC");
  const privateKey = Deno.env.get("VAPID_PRIVATE");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  if (!url || !serviceKey || !publicKey || !privateKey) {
    console.error("Push configuration is incomplete");
    return json({ error: "push_configuration_missing" }, 500);
  }

  const webhookSecret = req.headers.get("x-webhook-secret");
  if (!webhookSecret) return json({ error: "unauthorized" }, 401);

  let input: { id?: number | string };
  try { input = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const messageId = input?.id;
  if (messageId === undefined || messageId === null || !/^\d+$/.test(String(messageId))) {
    return json({ error: "message_id_required" }, 400);
  }

  try {
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authorized, error: authError } = await db.rpc(
      "verify_push_webhook_secret",
      { p_secret: webhookSecret },
    );
    if (authError) {
      console.error("Push webhook authentication check failed", authError.message);
      return json({ error: "webhook_authentication_unavailable" }, 500);
    }
    if (authorized !== true) return json({ error: "unauthorized" }, 401);

    const { data: message, error: messageError } = await db
      .from("msgs").select("id,conv_id,sender,created_at").eq("id", messageId).maybeSingle();
    if (messageError) throw messageError;
    if (!message) return json({ sent: 0, reason: "message_not_found" }, 404);
    if (Date.now() - new Date(message.created_at).getTime() > 5 * 60_000) {
      return json({ sent: 0, reason: "message_too_old" });
    }

    // Keep push payloads metadata-minimal: do not disclose sender, chat title,
    // conversation ID, or message content to the push service/provider.
    const { data: members, error: membersError } = await db
      .from("members").select("user_id,muted").eq("conv_id", message.conv_id).neq("user_id", message.sender);
    if (membersError) throw membersError;

    const recipientIds = [...new Set((members ?? [])
      .filter((member) => !member.muted && member.user_id)
      .map((member) => member.user_id))];
    if (!recipientIds.length) return json({ sent: 0, recipients: 0, expired: 0, failed: 0 });

    const { data: subscriptions, error: subscriptionError } = await db
      .from("push_subs").select("id,sub").in("user_id", recipientIds);
    if (subscriptionError) throw subscriptionError;

    const payload = JSON.stringify({
      title: "Новое сообщение",
      body: "Откройте приложение, чтобы прочитать его",
    });

    webpush.setVapidDetails(subject, publicKey, privateKey);
    let sent = 0, expired = 0, failed = 0;
    await Promise.all((subscriptions ?? []).map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription.sub, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          const { error: deleteError } = await db.from("push_subs").delete().eq("id", subscription.id);
          if (deleteError) {
            failed++;
            console.error("Could not remove expired push subscription", deleteError.message);
          } else expired++;
        } else {
          failed++;
          console.error("Push delivery failed", status ?? "unknown", String(error));
        }
      }
    }));
    return json({ sent, expired, failed, recipients: recipientIds.length, subscriptions: subscriptions?.length ?? 0 });
  } catch (error) {
    console.error("Push handler failed", error);
    return json({ error: "push_delivery_failed" }, 500);
  }
});
