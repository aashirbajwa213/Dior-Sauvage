/**
 * WhatsApp Notification Client for Gionee Pakistan
 * Sends messages via the OpenWA self-hosted API.
 * Reads configuration dynamically from the D1 `settings` table.
 */

import { getAllSettings } from "./settings";

/**
 * Resolves spintax format {option1|option2|option3} recursively or nested.
 * Example: "{Assalam-o-Alaikum|Hello|Hi} *{customer_name}*!"
 */
export function spinText(text: string): string {
    if (!text) return "";
    const spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/g;
    let spun = text;
    let iterations = 0;
    while (spintaxRegex.test(spun) && iterations < 10) {
        spun = spun.replace(spintaxRegex, (_, match) => {
            const options = match.split("|").map((s: string) => s.trim());
            return options[Math.floor(Math.random() * options.length)];
        });
        iterations++;
    }
    return spun;
}

/**
 * Replaces template placeholders like {customer_name}, {order_id}, {total}, {tracking_no}
 * with actual order data and evaluates dynamic Spintax variations.
 * Also supports multi-template rotation if separated by '---'.
 */
export function renderTemplate(template: string, data: Record<string, string | number>): string {
    if (!template) return "";

    // 1. If multiple full template variations separated by '---', pick one randomly
    let selectedTemplate = template;
    if (template.includes("---")) {
        const variations = template
            .split(/\n\s*---\s*\n/)
            .map(v => v.trim())
            .filter(Boolean);
        if (variations.length > 0) {
            selectedTemplate = variations[Math.floor(Math.random() * variations.length)];
        }
    }

    // 2. Replace specific data keys
    let rendered = selectedTemplate;
    for (const [key, value] of Object.entries(data)) {
        rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "gi"), String(value));
    }

    // 3. Resolve Spintax {A|B|C}
    rendered = spinText(rendered);

    return rendered.trim();
}

/**
 * Sends a WhatsApp text message to a phone number via OpenWA API.
 * Phone number format: should include country code, e.g. "923001234567"
 */
export async function sendWhatsAppMessage(
    db: any,
    phoneNumber: string,
    message: string
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    let settings: any = null;
    try {
        settings = await getAllSettings(db);

        if (!settings.whatsapp_enabled) {
            return { success: false, error: "WhatsApp integration is disabled in settings." };
        }
        if (!settings.whatsapp_api_url || !settings.whatsapp_api_key) {
            return { success: false, error: "WhatsApp API credentials are not configured. Go to Admin → Settings." };
        }

        // Normalize phone number: strip +, spaces, dashes
        let cleanPhone = phoneNumber.replace(/[\s\-\+]/g, "");
        // Ensure it starts with country code (Pakistan = 92)
        if (cleanPhone.startsWith("0")) {
            cleanPhone = "92" + cleanPhone.substring(1);
        }

        // OpenWA API endpoint for sending messages (safely strip any trailing slashes and whitespace)
        const apiUrl = (settings.whatsapp_api_url || "").trim().replace(/\/+$/, "");
        const sessionId = (settings.whatsapp_session_id || "default").trim();

        // ── Pre-flight: Resolve real JID/LID for this phone number ──────────
        // This ensures we store the actual LID (e.g. 64806845460583@lid)
        // so incoming @lid webhook replies match this order directly.
        let preResolvedChatId: string | null = null;
        try {
            const contactId = encodeURIComponent(`${cleanPhone}@c.us`);
            const contactEndpoints = [
                `${apiUrl}/api/${sessionId}/contacts?contactId=${contactId}`,
                `${apiUrl}/api/contacts?session=${encodeURIComponent(sessionId)}&contactId=${contactId}`,
                `${apiUrl}/api/${sessionId}/contacts/check-exists?phone=${cleanPhone}`,
            ];
            for (const ep of contactEndpoints) {
                try {
                    const res = await fetch(ep, {
                        headers: { "X-API-Key": settings.whatsapp_api_key, "Accept": "application/json" }
                    });
                    if (res.ok) {
                        const cdata: any = await res.json();
                        const jid = cdata?.id || cdata?.wid || cdata?.phone
                            || (Array.isArray(cdata) && (cdata[0]?.id || cdata[0]?.wid))
                            || null;
                        if (jid && typeof jid === "string" && jid.includes("@")) {
                            preResolvedChatId = jid.trim();
                            console.log(`[WA Send] Pre-resolved JID/LID for ${cleanPhone}: ${preResolvedChatId}`);
                            break;
                        }
                    }
                } catch (_) { /* try next endpoint */ }
            }
        } catch (e) {
            console.warn("[WA Send] Contact pre-resolution failed, will use send response:", e);
        }

        const endpoint = `${apiUrl}/api/sessions/${sessionId}/messages/send-text`;

        let response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": settings.whatsapp_api_key
            },
            body: JSON.stringify({
                chatId: `${cleanPhone}@c.us`,
                text: message
            })
        });

        // Auto-recovery: if OpenWA reports the session is stopped/inactive, attempt auto-start and retry
        if (!response.ok) {
            const errText = await response.text();
            if (errText.includes("is not active") || errText.includes("Start the session first") || errText.includes("not ready")) {
                console.log(`[WA Send] Session '${sessionId}' is idle/inactive. Attempting automatic start...`);
                try {
                    await fetch(`${apiUrl}/api/sessions/${sessionId}/start`, {
                        method: "POST",
                        headers: { "X-API-Key": settings.whatsapp_api_key, "Content-Type": "application/json" }
                    });
                    // Give OpenWA 3 seconds to spin up the session daemon
                    await new Promise(r => setTimeout(r, 3000));

                    // Retry sending
                    response = await fetch(endpoint, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-API-Key": settings.whatsapp_api_key
                        },
                        body: JSON.stringify({
                            chatId: `${cleanPhone}@c.us`,
                            text: message
                        })
                    });
                } catch (retryErr) {
                    console.warn("[WA Send] Auto-start attempt failed:", retryErr);
                }
            }

            if (!response.ok) {
                const text = response.bodyUsed ? errText : await response.text();
                const finalErr = `OpenWA API returned HTTP ${response.status}: ${text}`;
                
                // Dispatch background admin email alert if WhatsApp is down
                try {
                    const { sendWhatsAppFailureEmailAlert } = await import("./notifications");
                    sendWhatsAppFailureEmailAlert(db, null, finalErr, sessionId).catch(() => {});
                } catch (_) {}

                return { success: false, error: finalErr };
            }
        }

        const data = await response.json();
        
        // --- TEMPORARY DEBUG LOGGING ---
        try {
            await db.prepare(`
                INSERT INTO webhook_logs (sender, message, payload, status, response)
                VALUES (?, ?, ?, ?, ?)
            `).bind(
                "WAHA_SEND_DEBUG", 
                "Outbound message response", 
                JSON.stringify(data), 
                "debug", 
                cleanPhone
            ).run().catch(() => {});
        } catch(e) {}
        // -------------------------------
        
        // Deeply resolve the JID/LID used by OpenWA from the send response
        let resolvedChatId: string | null = preResolvedChatId;
        if (!resolvedChatId && data) {
            // Check common response structures for id / wid / from / to / lid
            const possibleIds = [
                data.to,
                data.chatId,
                data.id?.remote,
                data.id?._serialized,
                data.key?.remoteJid,
                data._data?.to?._serialized,
                data.from
            ];

            for (const candidate of possibleIds) {
                if (candidate && typeof candidate === "string" && candidate.includes("@")) {
                    resolvedChatId = candidate;
                    break;
                }
            }

            // If ID contains serialized string format, parse it
            if (!resolvedChatId && data.id && typeof data.id === "string") {
                const parts = data.id.split('_');
                const jidPart = parts.find((p: string) => p.includes('@'));
                if (jidPart) {
                    resolvedChatId = jidPart;
                }
            }

            if (resolvedChatId && typeof resolvedChatId === "string") {
                resolvedChatId = resolvedChatId.trim();
            }
        }

        console.log(`[WA Send] Final resolved chatId for ${cleanPhone}: ${resolvedChatId}`);
        return { success: true, resolvedChatId: resolvedChatId || undefined };
    } catch (e: any) {
        console.error("WhatsApp send failed:", e);
        const netErr = `Network error: ${e.message}`;
        try {
            const { sendWhatsAppFailureEmailAlert } = await import("./notifications");
            sendWhatsAppFailureEmailAlert(db, null, netErr, settings?.whatsapp_session_id || "default").catch(() => {});
        } catch (_) {}
        return { success: false, error: netErr };
    }
}

/**
 * Sends the order confirmation WhatsApp message using the template from settings.
 */
export async function sendOrderConfirmationRequest(
    db: any,
    order: {
        id: string | number;
        customer_name: string;
        customer_phone: string;
        total_amount: number;
        city: string;
    }
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    const settings = await getAllSettings(db);

    if (!settings.whatsapp_confirmation_enabled) {
        return { success: false, error: "Order confirmation WhatsApp notification is disabled in settings." };
    }

    // Fetch the order address and items from database dynamically
    let orderAddress = "";
    try {
        const orderRow = await db.prepare("SELECT address FROM orders WHERE id = ?").bind(String(order.id)).first();
        if (orderRow) {
            orderAddress = orderRow.address || "";
        }
    } catch (e) {
        console.error("[WA Confirmation Send] Error fetching order address from DB:", e);
    }

    let itemsFormatted = "";
    try {
        const { results: items } = await db.prepare("SELECT product_name, quantity, pack_size_label FROM order_items WHERE order_id = ?")
            .bind(String(order.id)).all();
        if (items && items.length > 0) {
            itemsFormatted = items.map((i: any) => `- ${i.product_name} (${i.pack_size_label}) x${i.quantity}`).join("\n");
        }
    } catch (e) {
        console.error("[WA Confirmation Send] Error fetching order items from DB:", e);
    }

    const template = settings.whatsapp_template_confirmation;

    const message = renderTemplate(template, {
        customer_name: order.customer_name,
        order_id: String(order.id),
        total: order.total_amount.toLocaleString(),
        total_amount: order.total_amount.toLocaleString(),
        city: order.city || "",
        City: order.city || "",
        address: orderAddress,
        full_address: orderAddress,
        items: itemsFormatted
    });

    const result = await sendWhatsAppMessage(db, order.customer_phone, message);

    if (result.success && result.resolvedChatId) {
        try {
            // Ensure whatsapp_chat_id column exists in orders
            await db.prepare(`ALTER TABLE orders ADD COLUMN whatsapp_chat_id TEXT;`).run().catch(() => {});
            
            // Save the JID/LID directly
            await db.prepare(`UPDATE orders SET whatsapp_chat_id = ? WHERE id = ?`)
                .bind(result.resolvedChatId, String(order.id)).run();
                
            console.log(`[WA Confirmation Send] Saved resolved JID/LID ${result.resolvedChatId} for order #${order.id}`);
        } catch (dbErr) {
            console.error("[WA Confirmation Send] DB error saving JID/LID:", dbErr);
        }
    }

    return result;
}

/**
 * Sends the "Thank you for confirming" WhatsApp message using the template from settings.
 */
export async function sendOrderThankYouMessage(
    db: any,
    order: {
        id: string | number;
        customer_name: string;
        customer_phone: string;
        tracking_no?: string;
    }
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    const settings = await getAllSettings(db);

    if (!settings.whatsapp_thank_you_enabled) {
        return { success: false, error: "Order thank you WhatsApp notification is disabled in settings." };
    }

    const template = settings.whatsapp_template_thank_you ||
        "Thank you {customer_name}! Your order #{order_id} is confirmed. We are packing it now and will email your tracking link once dispatched.";

    const message = renderTemplate(template, {
        customer_name: order.customer_name,
        order_id: String(order.id),
        tracking_no: order.tracking_no || "Pending"
    });

    const result = await sendWhatsAppMessage(db, order.customer_phone, message);

    if (result.success && result.resolvedChatId) {
        try {
            await db.prepare(`ALTER TABLE orders ADD COLUMN whatsapp_chat_id TEXT;`).run().catch(() => {});
            await db.prepare(`UPDATE orders SET whatsapp_chat_id = ? WHERE id = ?`)
                .bind(result.resolvedChatId, String(order.id)).run();
        } catch (dbErr) {
            console.error("[WA ThankYou Send] DB error saving JID/LID:", dbErr);
        }
    }

    return result;
}

/**
 * Sends the "Shipped" WhatsApp message to notify the customer about dispatch and tracking.
 */
export async function sendOrderShippedWhatsApp(
    db: any,
    order: {
        id: string | number;
        customer_name: string;
        customer_phone: string;
        tracking_no: string;
        tracking_url: string;
    }
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    const settings = await getAllSettings(db);

    if (!settings.whatsapp_shipped_enabled) {
        return { success: false, error: "Order shipped WhatsApp notification is disabled in settings." };
    }

    const template = settings.whatsapp_template_shipped || "*📦 Your Order Has Been Shipped!*\n\n" +
        "Hi *{customer_name}*,\n\n" +
        "Great news! Your Gionee order *#{order_id}* has been dispatched.\n\n" +
        "*Tracking Number:* {tracking_no}\n" +
        "*Track Here:* {tracking_url}\n\n" +
        "_Auto-message: Leave a message if you have queries; our representative will reply shortly._";

    const message = renderTemplate(template, {
        customer_name: order.customer_name,
        order_id: String(order.id),
        tracking_no: order.tracking_no,
        tracking_url: order.tracking_url
    });

    const result = await sendWhatsAppMessage(db, order.customer_phone, message);

    if (result.success && result.resolvedChatId) {
        try {
            await db.prepare(`ALTER TABLE orders ADD COLUMN whatsapp_chat_id TEXT;`).run().catch(() => {});
            await db.prepare(`UPDATE orders SET whatsapp_chat_id = ? WHERE id = ?`)
                .bind(result.resolvedChatId, String(order.id)).run();
        } catch (dbErr) {
            console.error("[WA Shipped Send] DB error saving JID/LID:", dbErr);
        }
    }

    return result;
}

export interface ReturnedOrderItem {
    id: string | number;
    customer_name: string;
    customer_phone: string;
    city?: string;
    tracking_no?: string;
    courier_provider?: string;
    courier_status?: string;
    return_reason?: string;
}

/**
 * Sends a single consolidated WhatsApp alert message to admin when one or multiple orders transition to Returned status.
 */
export async function sendReturnedOrdersBatchAlert(
    db: any,
    orders: ReturnedOrderItem[]
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    if (!orders || orders.length === 0) {
        return { success: false, error: "No returned orders provided." };
    }

    const settings = await getAllSettings(db);

    if (!settings.whatsapp_return_alert_enabled) {
        return { success: false, error: "WhatsApp return alert is disabled in settings." };
    }

    const targetPhone = (settings.whatsapp_return_alert_phone || settings.public_whatsapp_number || "").trim();
    if (!targetPhone) {
        return { success: false, error: "No admin WhatsApp phone number configured for return alerts." };
    }

    const { getCourierProviderName } = await import("./courier");

    // Format the order blocks
    const orderBlocks = orders.map((o, index) => {
        const courierName = getCourierProviderName(o.courier_provider, o.tracking_no);
        const reason = (o.return_reason || o.courier_status || "Return in process").trim();
        const header = orders.length > 1 ? `*${index + 1}. Order #${o.id}*` : `*Order #${o.id}*`;
        return `${header}\n` +
            `• *Name:* ${o.customer_name || "Valued Customer"}\n` +
            `• *Phone:* ${o.customer_phone || "N/A"}\n` +
            `• *City:* ${o.city || "N/A"}\n` +
            `• *Tracking:* ${o.tracking_no || "N/A"} (${courierName})\n` +
            `• *Return Reason:* ${reason}`;
    });

    const ordersListText = orderBlocks.join("\n\n");
    const countStr = String(orders.length);
    const firstOrder = orders[0];
    const firstCourier = getCourierProviderName(firstOrder.courier_provider, firstOrder.tracking_no);
    const firstReason = (firstOrder.return_reason || firstOrder.courier_status || "Return in process").trim();

    const defaultTemplate = "*⚠️ Return Alert: {count} Order(s) Marked as Returned*\n\n" +
        "{orders_list}\n\n" +
        "_Status updated to Returned in system._";

    const template = settings.whatsapp_template_returned || defaultTemplate;

    const message = renderTemplate(template, {
        count: countStr,
        orders_list: ordersListText,
        order_id: String(firstOrder.id),
        customer_name: firstOrder.customer_name || "Valued Customer",
        customer_phone: firstOrder.customer_phone || "N/A",
        city: firstOrder.city || "N/A",
        tracking_no: firstOrder.tracking_no || "N/A",
        courier_name: firstCourier,
        return_reason: firstReason,
        courier_status: firstReason
    });

    return await sendWhatsAppMessage(db, targetPhone, message);
}

/**
 * Convenience wrapper for sending a single order return alert.
 */
export async function sendOrderReturnedAlert(
    db: any,
    order: ReturnedOrderItem,
    returnReason?: string
): Promise<{ success: boolean; error?: string; resolvedChatId?: string }> {
    return sendReturnedOrdersBatchAlert(db, [{
        ...order,
        return_reason: returnReason || order.return_reason || order.courier_status
    }]);
}
