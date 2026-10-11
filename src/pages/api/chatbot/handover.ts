import type { APIRoute } from "astro";
import { getChatbotConfig, formatWhatsAppUrl } from "../../../utils/chatbot";

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database not connected" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json();
        let conversationId = (body.conversationId || "").trim();
        const sessionId = (body.sessionId || "").trim() || ("sess_" + Math.random().toString(36).substring(2, 10));
        const name = (body.name || "").trim() || null;
        const phone = (body.phone || "").trim() || null;
        const reason = (body.reason || "Customer requested human support directly via chat widget.").trim();

        const config = await getChatbotConfig(db);
        const waUrl = formatWhatsAppUrl(config.handoverWhatsapp, config.handoverWhatsappPrefill);
        const contactUrl = (config.handoverContactUrl && config.handoverContactUrl !== "/contact") ? config.handoverContactUrl : "/contact/";

        const handoverReply = `Message our support team on WhatsApp. They will respond to your query at the earliest!\n\n[Chat on WhatsApp](${waUrl})\n\nIf you prefer email, please visit our [Contact Page](${contactUrl}) to fill out the form.`;
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";

        // Check or create conversation in database
        let convExists = null;
        if (conversationId) {
            convExists = await db.prepare("SELECT id FROM chat_conversations WHERE id = ?").bind(conversationId).first();
        }

        if (!convExists) {
            conversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const metadata = JSON.stringify({
                type: "handover_request",
                ip: clientIp,
                userAgent: request.headers.get("user-agent") || "unknown",
            });
            await db.prepare(
                `INSERT INTO chat_conversations (id, session_id, status, handover_reason, customer_name, customer_phone, metadata, created_at, updated_at) 
                 VALUES (?, ?, 'handed_over', ?, ?, ?, ?, datetime('now'), datetime('now'))`
            ).bind(conversationId, sessionId, reason, name, phone, metadata).run();
        } else {
            // Update conversation record
            await db.prepare(
                `UPDATE chat_conversations 
                 SET status = 'handed_over', handover_reason = ?, customer_name = COALESCE(?, customer_name), customer_phone = COALESCE(?, customer_phone), updated_at = datetime('now') 
                 WHERE id = ?`
            ).bind(reason, name, phone, conversationId).run();
        }

        // Add user intent and bot handover message into chat transcript
        try {
            await db.prepare(
                `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
                 VALUES (?, 'user', 'Customer requested human support (WhatsApp handover)', datetime('now'))`
            ).bind(conversationId).run();

            await db.prepare(
                `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
                 VALUES (?, 'assistant', ?, datetime('now'))`
            ).bind(conversationId, handoverReply).run();
        } catch (msgErr) {
            console.error("Failed to log handover messages:", msgErr);
        }

        return new Response(
            JSON.stringify({
                success: true,
                conversationId,
                message: handoverReply,
                whatsappUrl: waUrl,
                whatsappNumber: config.handoverWhatsapp,
                contactUrl: contactUrl,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (e: any) {
        console.error("API /api/chatbot/handover error:", e);
        return new Response(JSON.stringify({ error: e.message || "Failed to trigger handover" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
