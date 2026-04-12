import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from "npm:web-push"

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let body;
  try {
    body = await req.json();
    console.log("FULL BODY:", JSON.stringify(body));
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const record = body.record;
  const oldRecord = body.old_record;

  webpush.setVapidDetails(
    'mailto:myfreeformarchive@gmail.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  )

  // ─── PATH A: MESSAGE NOTIFICATION ───
  if (record?.receiver_id) {
    const receiverId = record.receiver_id;
    const msgData = record.payload;
    const authorHandle = record.author_handle;

    const { data: registry, error: dbError } = await supabaseAdmin
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', receiverId)
      .single();

    if (dbError || !registry) {
      console.error("DB Error or no token:", dbError);
      return new Response("No token found", { status: 200 });
    }

    try {
      const senderId = msgData?.senderId || '';
      const safeHandle = authorHandle ? String(authorHandle) : '';

      // If no handle, show "Someone" instead of a raw ID
      const displayTitle = safeHandle
        ? `@${safeHandle.toLowerCase()}`
        : 'Someone sent you a message';

      const urlHandle = safeHandle ? encodeURIComponent(safeHandle) : '';
      const chatUrl = `/?open=chat&user=${senderId}&handle=${urlHandle}`;

      const pushSubscription = typeof registry.token === 'string'
        ? JSON.parse(registry.token)
        : registry.token;

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify({
          title: displayTitle,
          body: msgData?.text || "You have a new message!",
		  icon: "https://myfreeform.page/icon_2-512.png",
		  badge: "https://myfreeform.page/badge-96.png",
          data: { url: chatUrl },
          senderId: senderId,
          actions: [{ action: 'open', title: 'Open Message' }],
          tag: 'new-dm',
          renotify: true,
		  color: "#9D60FF",
        })
      )
      return new Response("Push sent successfully", { status: 200 })
    } catch (err) {
      console.error("WebPush Error:", err.message);
      return new Response(`Error: ${err.message}`, { status: 500 })
    }
  }

  // ─── PATH B: LIKE OR COMMENT NOTIFICATION ───
  if (record?.author_id) {
    const authorId = record.author_id;

    const likeIncreased = record.like_count > (oldRecord?.like_count ?? 0);
    const commentIncreased = record.comment_count > (oldRecord?.comment_count ?? 0);

    if (!likeIncreased && !commentIncreased) {
      return new Response("No relevant change", { status: 200 });
    }

    const notifTitle = likeIncreased ? "❤️ Someone liked your post!" : "💬 Someone commented on your post!";
    const notifBody = likeIncreased ? "Your post is getting some love." : "Someone left a comment on your post.";

    const { data: registry, error: dbError } = await supabaseAdmin
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', authorId)
      .single();

    if (dbError || !registry) {
      console.error("No token for author:", dbError);
      return new Response("No token found", { status: 200 });
    }

    try {
      const pushSubscription = typeof registry.token === 'string'
        ? JSON.parse(registry.token)
        : registry.token;

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify({
          title: notifTitle,
          body: notifBody,
          icon: "https://myfreeform.page/icon_2-512.png",
		  badge: "https://myfreeform.page/badge-96.png",
          tag: likeIncreased ? 'new-like' : 'new-comment',
          renotify: true,
		  color: "#9D60FF",
        })
      )
      return new Response("Push sent successfully", { status: 200 })
    } catch (err) {
      console.error("WebPush Error:", err.message);
      return new Response(`Error: ${err.message}`, { status: 500 })
    }
  }

  return new Response("No actionable data", { status: 200 });
})