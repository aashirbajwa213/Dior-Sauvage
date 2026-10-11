import type { APIRoute } from "astro";
import { getChatbotConfig, formatWhatsAppUrl } from "../../../utils/chatbot";

export const GET: APIRoute = async ({ locals }) => {
    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ enabled: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const config = await getChatbotConfig(db);
        const waUrl = formatWhatsAppUrl(config.handoverWhatsapp, config.handoverWhatsappPrefill);

        const contactUrl = (config.handoverContactUrl && config.handoverContactUrl !== "/contact") 
            ? config.handoverContactUrl 
            : "/contact/";
        const handoverMsg = (config.handoverMessage && !config.handoverMessage.toLowerCase().includes("forwarded") && !config.handoverMessage.toLowerCase().includes("email shortly"))
            ? config.handoverMessage
            : "Message our support team on WhatsApp. They will respond to your query at the earliest!";

        // Expose only safe public frontend properties
        return new Response(
            JSON.stringify({
                enabled: config.enabled,
                title: config.title,
                welcomeMessage: config.welcomeMessage,
                suggestedPrompts: config.suggestedPrompts,
                handoverWhatsapp: config.handoverWhatsapp,
                handoverWhatsappUrl: waUrl,
                handoverContactUrl: contactUrl,
                handoverMessage: handoverMsg,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=60", // Short cache for dynamic updates
                },
            }
        );
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
