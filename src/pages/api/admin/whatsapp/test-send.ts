import type { APIRoute } from "astro";
import { getAllSettings } from "../../../../utils/settings";
import { renderTemplate, sendWhatsAppMessage } from "../../../../utils/whatsapp";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ success: false, error: "Database connection unavailable." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const phone = String(body.phone || "").trim();
        const customMessage = String(body.message || "").trim();
        const templateType = String(body.templateType || "").trim();

        if (!phone) {
            return new Response(JSON.stringify({ success: false, error: "Phone number is required." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const settings = await getAllSettings(db);

        let textToSend = customMessage;

        if (templateType && !customMessage) {
            let template = "";
            if (templateType === "confirmation") {
                template = settings.whatsapp_template_confirmation;
            } else if (templateType === "thank_you") {
                template = settings.whatsapp_template_thank_you;
            } else if (templateType === "shipped") {
                template = settings.whatsapp_template_shipped;
            } else if (templateType === "returned") {
                template = settings.whatsapp_template_returned;
            }

            const mockData = {
                customer_name: "Muhammad Ali",
                order_id: "GPK09999",
                total: "1,499",
                total_amount: "1,499",
                city: "Lahore",
                City: "Lahore",
                address: "House 12, Street 4, Gulberg III, Lahore",
                full_address: "House 12, Street 4, Gulberg III, Lahore",
                items: "- Gionee Handsfree Original (Type-C) x1",
                tracking_no: "SA7540893000",
                courier_name: "RS Courier",
                timestamp: new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
            };

            textToSend = renderTemplate(template, mockData);
        } else if (customMessage) {
            // Apply Spintax resolution to custom text if any
            textToSend = renderTemplate(customMessage, {
                customer_name: "Muhammad Ali",
                order_id: "GPK09999",
                total_amount: "1,499",
                city: "Lahore",
                tracking_no: "SA7540893000"
            });
        }

        if (!textToSend) {
            return new Response(JSON.stringify({ success: false, error: "No message text or template available to send." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const startTime = Date.now();
        const result = await sendWhatsAppMessage(db, phone, textToSend);
        const latencyMs = Date.now() - startTime;

        return new Response(JSON.stringify({
            success: result.success,
            error: result.error,
            resolvedChatId: result.resolvedChatId,
            renderedText: textToSend,
            latencyMs
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
