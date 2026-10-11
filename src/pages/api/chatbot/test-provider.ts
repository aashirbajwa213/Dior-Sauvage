import type { APIRoute } from "astro";
import { saveMultipleSettings } from "../../../utils/settings";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;

    let body: any = {};
    try {
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const provider = String(body.provider || "openrouter").toLowerCase().trim();
        let apiKey = String(body.apiKey || "").trim();
        let endpoint = String(body.endpoint || "").trim();
        let model = String(body.model || "").trim();

        // If key not in body, check DB specifically for this provider
        if (!apiKey && db) {
            try {
                const row = await db.prepare("SELECT value FROM settings WHERE key = ?")
                    .bind(`chatbot_key_${provider}`)
                    .first();
                apiKey = (row?.value || "").trim();

                if (!apiKey) {
                    const activeRow = await db.prepare("SELECT value FROM settings WHERE key = 'chatbot_llm_provider'").first();
                    if (activeRow?.value === provider) {
                        const legacyRow = await db.prepare("SELECT value FROM settings WHERE key = 'chatbot_api_key'").first();
                        apiKey = (legacyRow?.value || "").trim();
                    }
                }
            } catch (err) {}
        }

        if (!apiKey && provider !== "custom") {
            if (db) {
                await saveMultipleSettings(db, {
                    [`chatbot_status_${provider}`]: "not_configured",
                    [`chatbot_status_msg_${provider}`]: "API key missing",
                });
            }
            return new Response(JSON.stringify({ 
                success: false, 
                error: "API Key is required to connect to this provider." 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Determine chat completion URL
        let apiUrl = "https://api.openai.com/v1/chat/completions";
        if (provider === "gemini") {
            apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        } else if (provider === "groq") {
            apiUrl = "https://api.groq.com/openai/v1/chat/completions";
        } else if (provider === "openrouter") {
            apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        } else if (provider === "custom" && endpoint) {
            let ep = endpoint.replace(/\/+$/, "");
            if (!ep.endsWith("/chat/completions")) {
                ep = `${ep}/chat/completions`;
            }
            apiUrl = ep;
        }

        const defaultModels: Record<string, string> = {
            openrouter: "openrouter/free",
            gemini: "gemini-2.0-flash",
            groq: "qwen/qwen3.8-27b",
            openai: "gpt-4o-mini",
            custom: "local-model",
        };
        const testModel = model || defaultModels[provider] || "gpt-4o-mini";

        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Gionee-Support/1.0",
        };
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        if (provider === "openrouter" || apiUrl.includes("openrouter")) {
            headers["HTTP-Referer"] = "https://gionee.com.pk";
            headers["X-Title"] = "Gionee Pakistan";
        }

        const res = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: testModel,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 5,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;

        if (!res.ok) {
            const errBody = await res.text();
            let parsedErr = errBody;
            try {
                const j = JSON.parse(errBody);
                parsedErr = j.error?.message || j.message || errBody;
            } catch (e) {}

            const errorSummary = `HTTP ${res.status}: ${String(parsedErr).slice(0, 150)}`;
            if (db) {
                await saveMultipleSettings(db, {
                    [`chatbot_status_${provider}`]: "error",
                    [`chatbot_status_msg_${provider}`]: errorSummary,
                    [`chatbot_tested_${provider}`]: new Date().toISOString(),
                });
            }

            return new Response(JSON.stringify({ 
                success: false, 
                error: errorSummary,
                latencyMs 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (db) {
            await saveMultipleSettings(db, {
                [`chatbot_status_${provider}`]: "ready",
                [`chatbot_status_msg_${provider}`]: `Verified in ${latencyMs}ms`,
                [`chatbot_tested_${provider}`]: new Date().toISOString(),
            });
        }

        return new Response(JSON.stringify({
            success: true,
            latencyMs,
            message: `Connection verified successfully (${latencyMs}ms)`,
            testedModel: testModel,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        const errMsg = e.name === "AbortError" 
            ? "Connection test timed out after 8 seconds." 
            : (e.message || "Connection test failed.");

        if (db && body?.provider) {
            await saveMultipleSettings(db, {
                [`chatbot_status_${body.provider}`]: "error",
                [`chatbot_status_msg_${body.provider}`]: errMsg,
                [`chatbot_tested_${body.provider}`]: new Date().toISOString(),
            });
        }

        return new Response(JSON.stringify({
            success: false,
            error: errMsg
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
};