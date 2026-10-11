import type { APIRoute } from "astro";
import { getCourierProviderName } from "../../../utils/courier";
import { syncSingleOrderTracking } from "../../../utils/orderSync";

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;
    const env = locals.runtime?.env;

    if (!db) {
        return new Response(JSON.stringify({ success: false, error: "Database not connected." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json();
        const rawOrderId = String(body.orderId || "").trim();
        const rawPhone = String(body.phone || "").trim();
        let conversationId = String(body.conversationId || "").trim();
        const sessionId = String(body.sessionId || "").trim() || ("sess_" + Math.random().toString(36).substring(2, 10));

        if (!rawOrderId) {
            return new Response(JSON.stringify({ success: false, error: "Please enter your Order ID." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (!rawPhone) {
            return new Response(JSON.stringify({ success: false, error: "Please enter your Phone Number." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const cleanOrderId = rawOrderId.replace(/^#+/, "").trim();
        const phoneDigits = rawPhone.replace(/\D/g, "");

        if (phoneDigits.length < 4) {
            return new Response(JSON.stringify({ success: false, error: "Please enter a valid phone number (at least 4 digits)." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        let order: any = await db.prepare(
            `SELECT id, customer_name, customer_phone, customer_email, city, address, total_amount, delivery_fee, status, tracking_no, courier_provider, courier_order_id, courier_status, created_at, order_summary 
             FROM orders 
             WHERE id = ? OR id = ? LIMIT 1`
        ).bind(cleanOrderId, `#${cleanOrderId}`).first();

        if (!order) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: `Order #${cleanOrderId} was not found. Please check your Order ID and try again.` 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const storedPhoneDigits = String(order.customer_phone || "").replace(/\D/g, "");
        const isMatch = storedPhoneDigits.endsWith(phoneDigits) || phoneDigits.endsWith(storedPhoneDigits);

        if (!isMatch) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "The phone number provided does not match this order. Please verify the phone number used at checkout." 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const trackingNo = (order.tracking_no || "").trim();
        const courierProvider = order.courier_provider || "";
        const internalTrackingUrl = `/track-order/${order.id}/`;
        const courierName = trackingNo ? getCourierProviderName(courierProvider, trackingNo) : "Courier Partner";

        // Perform real-time live RS Courier status sync and D1 update
        let liveTrackingEvent: any = null;
        if (trackingNo) {
            try {
                const syncRes = await syncSingleOrderTracking(db, env, order);
                if (syncRes.success) {
                    order.status = syncRes.newStatus;
                    order.courier_status = syncRes.rawCourierStatus;
                    liveTrackingEvent = syncRes.latestEvent;
                }
            } catch (err) {
                console.error("Live tracking sync in chatbot track-order API failed:", err);
            }
        }

        const customerName = (order.customer_name || "").trim() || "Valued Customer";
        let statusDescription = "";

        if (order.status === "Delivered") {
            statusDescription = "Your order has been delivered successfully. We hope you enjoy your Gionee handsfree!";
        } else if (order.status === "Shipped") {
            statusDescription = `Your parcel is on its way to ${order.city} via ${courierName}.`;
        } else if (order.status === "Booked") {
            statusDescription = `Your parcel is booked with ${courierName} and being prepared for handover.`;
        } else if (order.status === "Confirmed") {
            statusDescription = "Your order has been confirmed and is being packaged for dispatch.";
        } else if (order.status === "Cancelled") {
            statusDescription = "This order was cancelled. If you have any questions, please reach out to our support team.";
        } else {
            statusDescription = "Your order is currently pending and will be confirmed shortly.";
        }

        const lines = [
            `Hello **${customerName}**!`,
            "",
            `Here is the latest update for your Order **#${order.id}**:`,
            `• **Order Status:** ${order.status}`,
            `• **Delivery Destination:** ${order.city}`,
            `• **Total Amount:** PKR ${Number(order.total_amount).toLocaleString()}`,
        ];

        if (trackingNo) {
            lines.push(`• **Courier Partner:** ${courierName}`);
            lines.push(`• **Tracking Number:** ${trackingNo}`);
            if (liveTrackingEvent?.status) {
                lines.push(`• **Latest Courier Scan:** ${liveTrackingEvent.status} (${liveTrackingEvent.created || ""})`);
            }
        }
        lines.push(`• **Live Tracking Page:** [Track Order #${order.id}](https://gionee.com.pk/track-order/${order.id}/)`);

        lines.push("");
        lines.push(statusDescription);

        const formattedMessage = lines.join("\n");
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";

        // Ensure chat conversation and messages are logged in D1 database for business analytics
        try {
            let convExists = null;
            if (conversationId) {
                convExists = await db.prepare("SELECT id FROM chat_conversations WHERE id = ?").bind(conversationId).first();
            }

            if (!convExists) {
                conversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const metadata = JSON.stringify({
                    type: "order_tracking",
                    order_id: order.id,
                    ip: clientIp,
                    userAgent: request.headers.get("user-agent") || "unknown",
                });
                await db.prepare(
                    `INSERT INTO chat_conversations (id, session_id, status, customer_name, customer_phone, metadata, created_at, updated_at) 
                     VALUES (?, ?, 'active', ?, ?, ?, datetime('now'), datetime('now'))`
                ).bind(conversationId, sessionId, customerName, order.customer_phone, metadata).run();
            } else {
                await db.prepare(
                    `UPDATE chat_conversations 
                     SET customer_name = COALESCE(customer_name, ?), customer_phone = COALESCE(customer_phone, ?), updated_at = datetime('now') 
                     WHERE id = ?`
                ).bind(customerName, order.customer_phone, conversationId).run();
            }

            // Record user tracking request and bot reply
            const userPrompt = `Track Order #${order.id} (Phone: ${rawPhone})`;
            await db.prepare(
                `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
                 VALUES (?, 'user', ?, datetime('now'))`
            ).bind(conversationId, userPrompt).run();

            await db.prepare(
                `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
                 VALUES (?, 'assistant', ?, datetime('now'))`
            ).bind(conversationId, formattedMessage).run();
        } catch (convErr) {
            console.error("Failed to log chat tracking conversation/messages:", convErr);
        }

        return new Response(JSON.stringify({
            success: true,
            conversationId: conversationId,
            order: {
                id: order.id,
                customerName: customerName,
                status: order.status,
                city: order.city,
                totalAmount: order.total_amount,
                trackingNo: trackingNo,
                trackingUrl: internalTrackingUrl,
                internalTrackingUrl: internalTrackingUrl,
                courierPortalUrl: "",
                courierName: courierName,
                courierStatus: order.courier_status,
                liveEvent: liveTrackingEvent,
                statusDescription: statusDescription,
                formattedMessage: formattedMessage,
            }
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("Track order API exception:", e);
        return new Response(JSON.stringify({ success: false, error: e.message || "Failed to process tracking request." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
