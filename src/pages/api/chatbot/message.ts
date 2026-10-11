import type { APIRoute } from "astro";
import { getChatbotConfig, runChatbotTurn, type ChatMessageItem } from "../../../utils/chatbot";

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;
    const env = locals.runtime?.env;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database not connected" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json();
        const rawMessage = (body.message || "").trim();
        const sessionId = (body.sessionId || "").trim();
        let conversationId = (body.conversationId || "").trim();

        if (!rawMessage) {
            return new Response(JSON.stringify({ error: "Message content cannot be empty" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Session ID required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const config = await getChatbotConfig(db);
        if (!config.enabled) {
            return new Response(
                JSON.stringify({ reply: "Our chat assistant is currently offline. Please reach out to us directly on WhatsApp or fill out the form on our Contact page (/contact)." }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // 1. Rate Limiting Check
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

        const rateCheck: any = await db.prepare(
            `SELECT count(*) as count 
             FROM chat_messages m
             JOIN chat_conversations c ON m.conversation_id = c.id
             WHERE (c.session_id = ? OR c.metadata LIKE ?) AND m.role = 'user' AND m.created_at > ?`
        ).bind(sessionId, `%"ip":"${clientIp}"%`, oneHourAgo).first();

        const messagesInLastHour = rateCheck?.count || 0;
        if (messagesInLastHour >= config.rateLimitPerHour) {
            return new Response(
                JSON.stringify({
                    reply: "You have reached the message limit. For immediate assistance, please connect with us directly on WhatsApp or submit our Contact page form (/contact).",
                    rateLimited: true,
                }),
                { status: 429, headers: { "Content-Type": "application/json" } }
            );
        }

        // 2. Ensure Conversation Exists
        let convExists = null;
        if (conversationId) {
            convExists = await db.prepare("SELECT id FROM chat_conversations WHERE id = ?").bind(conversationId).first();
        }

        if (!convExists) {
            conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const metadata = JSON.stringify({
                ip: clientIp,
                userAgent: request.headers.get("user-agent") || "unknown",
            });
            await db.prepare(
                `INSERT INTO chat_conversations (id, session_id, status, metadata, created_at, updated_at) 
                 VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
            ).bind(conversationId, sessionId, metadata).run();
        } else {
            // Update updated_at
            await db.prepare("UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?").bind(conversationId).run();
        }

        // 3. Save User Message
        await db.prepare(
            `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
             VALUES (?, 'user', ?, datetime('now'))`
        ).bind(conversationId, rawMessage).run();

        // 4. Fetch Recent Conversation Context (Last 12 messages)
        const { results: rawHistory } = await db.prepare(
            `SELECT role, content, tool_calls, tool_call_id 
             FROM chat_messages 
             WHERE conversation_id = ? 
             ORDER BY id DESC LIMIT 12`
        ).bind(conversationId).all();

        const history: ChatMessageItem[] = (rawHistory || [])
            .reverse()
            .map((r: any) => ({
                role: r.role,
                content: r.content,
                tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
                tool_call_id: r.tool_call_id || undefined,
            }));

        // 5. Run Orchestrator Turn
        const turnResult = await runChatbotTurn(db, env, config, conversationId, history);

        // 6. Save Assistant Response (storing providerUsed in name column for admin tracking)
        await db.prepare(
            `INSERT INTO chat_messages (conversation_id, role, content, name, created_at) 
             VALUES (?, 'assistant', ?, ?, datetime('now'))`
        ).bind(conversationId, turnResult.reply, turnResult.providerUsed || config.llmProvider).run();

        return new Response(
            JSON.stringify({
                conversationId,
                reply: turnResult.reply,
                isHandover: !!turnResult.isHandover,
                providerUsed: turnResult.providerUsed || config.llmProvider,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (e: any) {
        console.error("API /api/chatbot/message exception:", e);
        return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
