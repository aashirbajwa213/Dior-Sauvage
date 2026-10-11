import type { APIRoute } from "astro";
import { getAllSettings } from "../../../../utils/settings";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ success: false, error: "Database connection unavailable." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const settings = await getAllSettings(db);
        const apiUrl = (settings.whatsapp_api_url || "").trim().replace(/\/+$/, "");
        const apiKey = (settings.whatsapp_api_key || "").trim();
        const sessionId = (settings.whatsapp_session_id || "default").trim();

        if (!apiUrl || !apiKey) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "WhatsApp API credentials are not configured.",
                status: "UNCONFIGURED" 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const sessionEndpoint = `${apiUrl}/api/sessions/${encodeURIComponent(sessionId)}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const res = await fetch(sessionEndpoint, {
                headers: {
                    "X-API-Key": apiKey,
                    "Accept": "application/json"
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errText = await res.text();
                return new Response(JSON.stringify({
                    success: false,
                    error: `OpenWA API returned HTTP ${res.status}: ${errText.substring(0, 150)}`,
                    status: "DISCONNECTED",
                    httpStatus: res.status
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const data: any = await res.json();
            const sessionStatus = data?.status || data?.state || "WORKING";
            const me = data?.me || data?.user || null;

            return new Response(JSON.stringify({
                success: true,
                status: sessionStatus,
                engine: data?.engine || "baileys",
                user: me,
                raw: data
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });

        } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            return new Response(JSON.stringify({
                success: false,
                error: fetchErr.name === "AbortError" ? "Connection timeout to OpenWA server (8s)." : fetchErr.message,
                status: "UNREACHABLE"
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
