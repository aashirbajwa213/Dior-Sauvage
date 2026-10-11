import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals }) => {
    try {
        const url = new URL(request.url);
        const phone = url.searchParams.get("phone");

        if (!phone) {
            return new Response(JSON.stringify({ success: false, error: "Phone number is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Standardize Pakistani phone to WhatsApp chat ID format: 92XXXXXXXXXX@c.us
        let cleanPhone = phone.replace(/[^0-9]/g, "");
        if (cleanPhone.startsWith("0")) {
            cleanPhone = "92" + cleanPhone.slice(1);
        } else if (cleanPhone.startsWith("3")) {
            cleanPhone = "92" + cleanPhone;
        }
        const chatId = `${cleanPhone}@c.us`;

        const OPENWA_API_KEY = "owa_k1_15c1dceff7164843f379ed083a0590f66cfe47cc46f4197a9c3239620855d8cb";
        const OPENWA_SESSION = "af484bb4-225b-4015-832a-5310ed4ed7a8";
        const OPENWA_BASE = "https://wa.rankmation.com";

        // Query OpenWA for recent messages (Limit 20 to be polite and fast)
        const openwaUrl = `${OPENWA_BASE}/api/sessions/${OPENWA_SESSION}/chats/${encodeURIComponent(chatId)}/messages?limit=20`;

        const resp = await fetch(openwaUrl, {
            method: "GET",
            headers: {
                "X-API-Key": OPENWA_API_KEY,
                "Content-Type": "application/json",
            }
        });

        if (!resp.ok) {
            const errText = await resp.text();
            return new Response(JSON.stringify({ 
                success: false, 
                error: `OpenWA error (${resp.status}): ${errText || resp.statusText}` 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const data: any = await resp.json();
        const messages = Array.isArray(data) ? data : (data.messages || data.data || []);

        // Filter and format readable messages (in-memory only, 0 database storage)
        const formatted = messages.map((m: any) => ({
            id: m.id,
            fromMe: Boolean(m.fromMe),
            body: m.body || m.caption || "[Media / Non-text]",
            timestamp: m.timestamp ? new Date(m.timestamp * 1000).toLocaleString("en-US", { timeZone: "Asia/Karachi" }) : "Recent",
            sender: m.fromMe ? "Gionee Support" : "Customer"
        }));

        return new Response(JSON.stringify({ 
            success: true, 
            phone: cleanPhone,
            chatId,
            totalMessages: formatted.length,
            messages: formatted 
        }), {
            status: 200,
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
