/**
 * WhatsApp Incoming Webhook Endpoint
 * Receives incoming messages from OpenWA and processes auto-confirmation.
 * 
 * Flow:
 * 1. Customer sends "YES" / "Confirm" / "👍" / "Haan" → Order auto-confirmed
 * 2. RS Courier booking is triggered automatically
 * 3. Thank-you WhatsApp message is sent back
 * 4. Timeline entries and webhook logs are recorded in real time
 */

import type { APIRoute } from "astro";
import { addTimelineEntry } from "../../../utils/timeline";
import { createCourierOrder } from "../../../utils/courier";
import { sendOrderThankYouMessage } from "../../../utils/whatsapp";
import { getAllSettings } from "../../../utils/settings";

/**
 * Log webhook execution details to D1 for real-time debug tracking
 */
async function logWebhook(
    db: any,
    sender: string | null,
    message: string | null,
    payload: any,
    status: string,
    response: string
) {
    try {
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sender TEXT,
                message TEXT,
                payload TEXT,
                status TEXT,
                response TEXT
            )
        `).run();

        await db.prepare(`
            INSERT INTO webhook_logs (sender, message, payload, status, response)
            VALUES (?, ?, ?, ?, ?)
        `).bind(
            sender || null,
            message || null,
            payload ? (typeof payload === "string" ? payload : JSON.stringify(payload)) : "{}",
            status,
            response
        ).run();

        // Limit logs to keep DB clean (keep last 200 logs)
        await db.prepare(`
            DELETE FROM webhook_logs WHERE id NOT IN (
                SELECT id FROM webhook_logs ORDER BY id DESC LIMIT 200
            )
        `).run();
    } catch (e) {
        console.error("[WA Webhook Log Error]", e);
    }
}

export const POST: APIRoute = async ({ request, locals }) => {
    const db = (locals as any).runtime?.env?.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database not available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    let rawBody = "";
    let bodyObj: any = null;
    let senderPhone = "";
    let messageBody = "";

    try {
        rawBody = await request.text();
        try {
            bodyObj = JSON.parse(rawBody);
        } catch {
            bodyObj = { raw: rawBody };
        }

        console.log("[WA Webhook] Raw Payload Received:", rawBody);

        // OpenWA nests message object inside "data" or "payload" or root
        const msgData = bodyObj.data || bodyObj.payload || bodyObj;
        
        // Extract message text from all possible OpenWA/WAHA fields
        messageBody = (
            msgData.body || 
            msgData.message || 
            msgData.text || 
            msgData.caption ||
            msgData._data?.body ||
            bodyObj.body ||
            bodyObj.message ||
            bodyObj.text ||
            ""
        ).toString().trim();
        
        // Extract raw sender JID/LID (e.g. "923001234567@c.us" or "64806845460583@lid")
        const rawSenderJid = (
            msgData.from || 
            msgData.chatId || 
            msgData.author ||
            msgData.sender?.id ||
            msgData._data?.from ||
            bodyObj.from || 
            bodyObj.chatId || 
            ""
        ).toString().trim();
        
        // Strip suffixes to extract digits
        senderPhone = rawSenderJid
            .replace(/@(c\.us|s\.whatsapp\.net|lid|g\.us)/gi, "")
            .trim();
        
        console.log("[WA Webhook] Parsed Message Body:", messageBody);
        console.log("[WA Webhook] Parsed Raw JID:", rawSenderJid);
        console.log("[WA Webhook] Parsed Sender Phone:", senderPhone);

        // 1. Check if outbound message sent by bot itself (fromMe)
        const isFromMe = msgData.fromMe === true || bodyObj.event === "message.sent" || bodyObj.event === "message.ack";
        if (isFromMe) {
            console.log("[WA Webhook] Ignored self/ack outbound event.");
            return new Response(JSON.stringify({ status: "ignored", reason: "from_me" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. Check if group message
        const isGroup = msgData.isGroupMsg || 
                        msgData.isGroup || 
                        rawSenderJid.endsWith("@g.us") || 
                        (msgData.chatId && String(msgData.chatId).endsWith("@g.us")) || 
                        false;

        if (isGroup) {
            console.log("[WA Webhook] Ignored group message.");
            await logWebhook(db, senderPhone || rawSenderJid, messageBody, bodyObj, "ignored", "Ignored group message.");
            return new Response(JSON.stringify({ status: "ignored", reason: "group_message" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 3. Ignore empty message body or sender
        if (!messageBody || !rawSenderJid) {
            console.log("[WA Webhook] Ignored empty message or missing sender.");
            await logWebhook(db, senderPhone || rawSenderJid, messageBody, bodyObj, "ignored", "Ignored empty message or missing sender.");
            return new Response(JSON.stringify({ status: "ignored", reason: "empty_message" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 4. Positive vs Negative Confirmation check (Comprehensive Urdu / English / Emoji support)
        const textLower = messageBody.toLowerCase().trim();
        
        // Negation words (e.g. "no", "nahi", "cancel", "don't send")
        const isNegation = /\b(no|not|cancel|dont|don't|never|nahi|na|mat|reject|cancel|kharab)\b/i.test(textLower) 
                        || textLower.includes("cancel")
                        || textLower.includes("nahi bhej")
                        || textLower.includes("mat bhejo");

        // Positive confirmation words and emojis
        const hasPositiveWord = 
            /\b(yes|yeah|yep|confirm|confirmed|ok|okay|ji|han|haan|hanji|yup|sure|done|theek|sahi|bilkul|send|bhej|bhejo|order)\b/i.test(textLower)
            || textLower.includes("yes")
            || textLower.includes("confirm")
            || textLower.includes("ok")
            || textLower.includes("ji")
            || textLower.includes("han")
            || textLower.includes("haan")
            || textLower.includes("bhej")
            || textLower.includes("theek")
            || textLower.includes("done")
            || textLower === "1"
            || textLower.startsWith("1 ")
            || textLower.includes("👍")
            || textLower.includes("👌")
            || textLower.includes("✅")
            || textLower.includes("✔")
            || textLower.includes("🆗");

        const isConfirmation = hasPositiveWord && !isNegation;

        console.log("[WA Webhook] Confirmation Match Status:", {
            isConfirmation,
            hasPositiveWord,
            isNegation,
            rawText: messageBody
        });

        if (!isConfirmation) {
            const outcome = `Message "${messageBody}" is not a recognized confirmation keyword or contains a cancellation phrase.`;
            console.log("[WA Webhook]", outcome);
            await logWebhook(db, rawSenderJid, messageBody, bodyObj, "ignored", outcome);
            return new Response(JSON.stringify({ status: "ignored", reason: "not_confirmation" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Clean sender phone to digits only
        const senderPhoneDigits = senderPhone.replace(/\D/g, "");
        const senderLast10 = senderPhoneDigits.slice(-10);
        const senderLast9 = senderPhoneDigits.slice(-9);
        const isLidSender = rawSenderJid.endsWith("@lid");

        // Collect all potential JID/LID/chat ID candidates from payload
        const chatIdCandidates = new Set<string>();
        if (rawSenderJid) chatIdCandidates.add(rawSenderJid);
        if (msgData.from) chatIdCandidates.add(String(msgData.from).trim());
        if (msgData.chatId) chatIdCandidates.add(String(msgData.chatId).trim());
        if (senderPhone) chatIdCandidates.add(senderPhone);
        if (senderPhoneDigits) {
            chatIdCandidates.add(senderPhoneDigits);
            chatIdCandidates.add(`${senderPhoneDigits}@c.us`);
            chatIdCandidates.add(`${senderPhoneDigits}@s.whatsapp.net`);
            chatIdCandidates.add(`${senderPhoneDigits}@lid`);
        }

        // Safely ensure whatsapp_chat_id column exists
        await db.prepare(`ALTER TABLE orders ADD COLUMN whatsapp_chat_id TEXT;`).run().catch(() => {});

        // Fetch recent Pending orders from D1 (up to 50 most recent)
        const pendingOrdersResult = await db.prepare(`
            SELECT * FROM orders 
            WHERE LOWER(status) = 'pending' 
            ORDER BY id DESC 
            LIMIT 50
        `).all();

        const pendingOrders: any[] = pendingOrdersResult.results || [];
        console.log(`[WA Webhook] Found ${pendingOrders.length} pending orders in database.`);

        // Helper function to match an order against sender
        const matchOrder = (order: any, phoneToMatch: string) => {
            // 1. Match by saved whatsapp_chat_id
            if (order.whatsapp_chat_id && chatIdCandidates.has(order.whatsapp_chat_id)) {
                return true;
            }

            // 2. Match by normalized phone
            const orderPhoneDigits = (order.customer_phone || "").replace(/\D/g, "");
            if (!orderPhoneDigits) return false;

            const orderLast10 = orderPhoneDigits.slice(-10);
            const orderLast9 = orderPhoneDigits.slice(-9);
            const targetDigits = phoneToMatch.replace(/\D/g, "");
            const targetLast10 = targetDigits.slice(-10);
            const targetLast9 = targetDigits.slice(-9);

            if (targetLast10 && orderLast10 && targetLast10 === orderLast10) return true;
            if (targetLast9 && orderLast9 && targetLast9 === orderLast9) return true;
            if (targetDigits && orderPhoneDigits === targetDigits) return true;

            return false;
        };

        let matchedOrder = pendingOrders.find(o => matchOrder(o, senderPhoneDigits));

        // ─── LID Resolution Fallback ─────────────────────────────────────────
        // If no direct match and sender uses @lid, resolve the LID to a real phone number
        // via OpenWA Contact API, then retry the lookup.
        if (!matchedOrder && isLidSender) {
            console.log("[WA Webhook] @lid sender — no pending order matched. Resolving LID via OpenWA API...");
            try {
                const settings = await getAllSettings(db);
                const apiUrl = (settings.whatsapp_api_url || "").trim().replace(/\/+$/, "");
                const sessionId = (bodyObj?.sessionId || bodyObj?.session || settings.whatsapp_session_id || "gionee-whatsapp").trim();
                const apiKey = settings.whatsapp_api_key;

                if (apiUrl && apiKey) {
                    const resolveEndpoints = [
                        `${apiUrl}/api/sessions/${sessionId}/contacts/${encodeURIComponent(rawSenderJid)}`,
                        `${apiUrl}/api/${sessionId}/contacts/${encodeURIComponent(rawSenderJid)}`,
                        `${apiUrl}/api/contacts?session=${encodeURIComponent(sessionId)}&contactId=${encodeURIComponent(rawSenderJid)}`,
                        `${apiUrl}/api/sessions/${sessionId}/contacts`
                    ];

                    let resolvedPhone: string | null = null;

                    for (const ep of resolveEndpoints) {
                        try {
                            const res = await fetch(ep, {
                                headers: { "X-API-Key": apiKey, "Accept": "application/json" }
                            });
                            if (res.ok) {
                                const data: any = await res.json();
                                const phone = data?.phone || data?.id?.replace(/@.*/, "") 
                                    || data?.wid?.replace(/@.*/, "")
                                    || data?.number
                                    || (Array.isArray(data) && data[0]?.phone)
                                    || null;

                                if (phone && /\d{7,}/.test(String(phone))) {
                                    const extracted = String(phone).replace(/\D/g, "");
                                    if (extracted !== String(rawSenderJid).replace(/\D/g, "")) {
                                        resolvedPhone = extracted;
                                        console.log("[WA Webhook] Successfully resolved LID to phone:", resolvedPhone, "via", ep);
                                        break;
                                    }
                                }
                            }
                        } catch (_) { /* try next endpoint */ }
                    }

                    if (resolvedPhone) {
                        matchedOrder = pendingOrders.find(o => matchOrder(o, resolvedPhone!));
                        if (matchedOrder) {
                            // Persist resolved LID directly to this order for future instant O(1) matching
                            await db.prepare(`UPDATE orders SET whatsapp_chat_id = ? WHERE id = ?`)
                                .bind(rawSenderJid, String(matchedOrder.id)).run().catch(() => {});
                            console.log(`[WA Webhook] Saved LID ${rawSenderJid} to Order #${matchedOrder.id}`);
                        }
                    }
                }
            } catch (lidErr: any) {
                console.error("[WA Webhook] LID resolution error:", lidErr);
            }
        }

        // If still not matched among pending orders, check if the customer already confirmed recently
        if (!matchedOrder) {
            const recentConfirmedResult = await db.prepare(`
                SELECT * FROM orders 
                WHERE LOWER(status) IN ('confirmed', 'booked') 
                ORDER BY id DESC 
                LIMIT 10
            `).all();
            
            const recentConfirmed: any[] = recentConfirmedResult.results || [];
            const alreadyConfirmedOrder = recentConfirmed.find(o => matchOrder(o, senderPhoneDigits));

            if (alreadyConfirmedOrder) {
                const msg = `Order #${alreadyConfirmedOrder.id} for ${alreadyConfirmedOrder.customer_name} is already ${alreadyConfirmedOrder.status}. Skipping duplicate confirmation.`;
                console.log("[WA Webhook]", msg);
                await logWebhook(db, rawSenderJid, messageBody, bodyObj, "success", msg);
                return new Response(JSON.stringify({ status: "already_confirmed", order_id: alreadyConfirmedOrder.id, message: msg }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const msg = `No pending order found for sender ${rawSenderJid} (digits: ${senderPhoneDigits || "none"}).`;
            console.log("[WA Webhook]", msg);
            await logWebhook(db, rawSenderJid, messageBody, bodyObj, "ignored", msg);
            return new Response(JSON.stringify({ status: "no_pending_order", sender: rawSenderJid }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // === AUTO-CONFIRM THE ORDER ===
        const order = matchedOrder;
        const orderId = String(order.id);
        console.log(`[WA Webhook] Matched Pending Order #${orderId} for customer: ${order.customer_name}`);

        // 1. Update status to Confirmed & record whatsapp_chat_id
        await db.prepare(`
            UPDATE orders 
            SET status = 'Confirmed', whatsapp_confirmed = 1, whatsapp_chat_id = COALESCE(whatsapp_chat_id, ?) 
            WHERE id = ?
        `).bind(rawSenderJid, orderId).run();

        // 2. Log timeline entry
        await addTimelineEntry(
            db, 
            orderId, 
            "Confirmed", 
            "Order Confirmed via WhatsApp",
            `Customer replied "${messageBody}" on WhatsApp to confirm order.`
        );

        // 3. Auto-book shipment with RS Courier
        let trackingNo = "";
        let courierMsg = "RS Courier booking was skipped or disabled.";
        
        try {
            const { results: items } = await db.prepare(`
                SELECT product_name, quantity, pack_size_label 
                FROM order_items 
                WHERE order_id = ?
            `).bind(orderId).all();

            const productDesc = (items || []).map((i: any) => `${i.product_name} (${i.pack_size_label}) x${i.quantity}`).join(", ");

            const courierResult = await createCourierOrder(db, {
                receiverName: order.customer_name,
                receiverPhone: order.customer_phone,
                receiverEmail: order.customer_email || "",
                receiverAddress: order.address,
                destinationCity: order.city,
                pieces: (items || []).reduce((sum: number, i: any) => sum + i.quantity, 0) || 1,
                weight: 1,
                collectionAmount: order.total_amount,
                productDescription: productDesc,
                orderId: orderId
            });

            if (courierResult.success && courierResult.data) {
                trackingNo = String(courierResult.data.tracking_no);
                const courierId = String(courierResult.data.id);
                const providerUsed = courierResult.providerUsed || "postex";

                await db.prepare(`ALTER TABLE orders ADD COLUMN courier_provider TEXT;`).run().catch(() => {});
                await db.prepare(`
                    UPDATE orders 
                    SET status = 'Booked', tracking_no = ?, courier_order_id = ?, courier_status = 'New Booked', courier_provider = ? 
                    WHERE id = ?
                `).bind(trackingNo, courierId, providerUsed, orderId).run();

                await addTimelineEntry(
                    db, 
                    orderId, 
                    "Booked", 
                    `Shipment Auto-Booked with ${providerUsed.toUpperCase()}`,
                    `Tracking Number: ${trackingNo}. Courier Order ID: ${courierId}.`
                );
                courierMsg = `Successfully auto-booked with ${providerUsed}. Tracking: ${trackingNo}`;
            } else {
                await addTimelineEntry(
                    db, 
                    orderId, 
                    "Warning", 
                    "Auto Courier Booking Failed",
                    `Reason: ${courierResult.error || "Unknown courier error"}. You can manually book from the admin panel.`
                );
                courierMsg = `Courier booking failed: ${courierResult.error}`;
            }
        } catch (courierError: any) {
            console.error("[WA Webhook] Courier booking threw exception:", courierError);
            await addTimelineEntry(
                db, 
                orderId, 
                "Warning", 
                "Courier Booking Error",
                `Error: ${courierError.message}. Manual booking required.`
            );
            courierMsg = `Courier booking error: ${courierError.message}`;
        }

        // 4. Send thank you WhatsApp message
        let thankYouMsg = "Skip sending thank you WhatsApp.";
        try {
            await sendOrderThankYouMessage(db, {
                id: order.id,
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                tracking_no: trackingNo
            });
            thankYouMsg = "Sent thank you WhatsApp message.";
        } catch (waError: any) {
            console.error("[WA Webhook] Failed to send thank you WhatsApp:", waError);
            thankYouMsg = `Failed to send thank you WhatsApp: ${waError.message}`;
        }

        const outcomeText = `Order #${orderId} for ${order.customer_name} Auto-Confirmed. ${courierMsg}. ${thankYouMsg}`;
        console.log("[WA Webhook] SUCCESS:", outcomeText);
        await logWebhook(db, rawSenderJid, messageBody, bodyObj, "success", outcomeText);

        return new Response(JSON.stringify({
            status: "confirmed",
            order_id: orderId,
            tracking_no: trackingNo || null,
            message: outcomeText
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error("WhatsApp webhook unhandled exception:", e);
        try {
            await logWebhook(db, senderPhone || "unknown", messageBody || "unknown", bodyObj || null, "error", `Exception: ${e.message}`);
        } catch (logErr) {
            console.error("Failed to write exception log to DB:", logErr);
        }
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

