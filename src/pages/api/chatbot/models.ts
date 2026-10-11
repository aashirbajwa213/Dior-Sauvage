import type { APIRoute } from "astro";
import { getChatbotConfig } from "../../../utils/chatbot";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;
    const env = locals.runtime?.env;

    try {
        let body: any = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const provider = (body.provider || "openai").toLowerCase();
        let customEndpoint = (body.endpoint || "").trim();
        let apiKey = (body.apiKey || "").trim();

        // If no API key supplied in request, read from DB specifically for this provider
        if (!apiKey && db) {
            try {
                const row: any = await db.prepare("SELECT value FROM settings WHERE key = ?")
                    .bind(`chatbot_key_${provider}`)
                    .first();
                apiKey = String(row?.value || "").trim();

                if (!apiKey) {
                    const activeRow: any = await db.prepare("SELECT value FROM settings WHERE key = 'chatbot_llm_provider'").first();
                    if (activeRow?.value === provider) {
                        const legacyRow: any = await db.prepare("SELECT value FROM settings WHERE key = 'chatbot_api_key'").first();
                        apiKey = String(legacyRow?.value || "").trim();
                    }
                }
            } catch (err) {
                console.error("Failed to read DB config in models.ts:", err);
            }
        }

        // Only enforce API key requirement for providers that strictly require it
        if (!apiKey && provider !== "custom") {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Please enter an API Key first to fetch available models.",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // Build list of candidate URLs to probe
        const candidateUrls: string[] = [];
        if (customEndpoint) {
            let ep = customEndpoint
                .replace(/\/chat\/completions\/?$/, "")
                .replace(/\/+$/, "");

            if (ep.endsWith("/v1")) {
                candidateUrls.push(`${ep}/models`);
                candidateUrls.push(`${ep.replace(/\/v1$/, "")}/models`);
                candidateUrls.push(`${ep.replace(/\/v1$/, "")}/api/tags`);
            } else {
                candidateUrls.push(`${ep}/models`);
                candidateUrls.push(`${ep}/v1/models`);
                candidateUrls.push(`${ep}/api/tags`);
            }
        } else if (provider === "gemini") {
            candidateUrls.push("https://generativelanguage.googleapis.com/v1beta/openai/models");
        } else if (provider === "groq") {
            candidateUrls.push("https://api.groq.com/openai/v1/models");
        } else if (provider === "openrouter" || provider === "anthropic") {
            candidateUrls.push("https://openrouter.ai/api/v1/models");
        } else if (provider === "mistral") {
            candidateUrls.push("https://api.mistral.ai/v1/models");
        } else {
            candidateUrls.push("https://api.openai.com/v1/models");
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Gionee-Bot/1.0",
        };
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        if (provider === "openrouter" || candidateUrls.some(u => u.includes("openrouter.ai"))) {
            headers["HTTP-Referer"] = "https://gionee.com.pk";
            headers["X-Title"] = "Gionee Pakistan";
        }

        let lastError = "";
        let rawData: any = null;
        let successfulUrl = "";

        for (const url of candidateUrls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);

                const res = await fetch(url, {
                    method: "GET",
                    headers,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errText = await res.text();
                    lastError = `Provider at ${url} returned HTTP ${res.status}: ${errText.slice(0, 160)}`;
                    if (res.status === 404 || res.status === 405) {
                        continue;
                    }
                    break;
                }

                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    const text = await res.text();
                    lastError = `Endpoint ${url} returned non-JSON (${contentType}): ${text.slice(0, 100)}`;
                    continue;
                }

                rawData = await res.json();
                successfulUrl = url;
                break;
            } catch (fetchErr: any) {
                if (fetchErr.name === "AbortError") {
                    lastError = `Request to ${url} timed out after 6 seconds.`;
                } else {
                    lastError = `Network error connecting to ${url}: ${fetchErr.message || String(fetchErr)}`;
                }
            }
        }

        if (!rawData) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: lastError || "Failed to retrieve models from provider. Please check your Endpoint URL and API Key.",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // Parse models from various formats
        let rawList: any[] = [];
        if (Array.isArray(rawData)) {
            rawList = rawData;
        } else if (Array.isArray(rawData.data)) {
            rawList = rawData.data;
        } else if (Array.isArray(rawData.models)) {
            rawList = rawData.models;
        }

        let models: { id: string; name: string; isFree?: boolean }[] = [];

        if (provider === "openrouter" || successfulUrl.includes("openrouter")) {
            // Always inject openrouter/free router at the top
            models.push({
                id: "openrouter/free",
                name: "Free Models Router (Auto Best Free) [FREE]",
                isFree: true,
            });

            const remoteModels = rawList.map((m: any) => {
                const id = m.id || "";
                const isFree = id.includes(":free") || (m.pricing?.prompt === "0" && m.pricing?.completion === "0");
                return {
                    id,
                    name: `${m.name || id}${isFree ? " [FREE]" : ""}`,
                    isFree,
                };
            }).filter(m => m.id && m.id !== "openrouter/free");

            remoteModels.sort((a, b) => {
                if (a.isFree && !b.isFree) return -1;
                if (!a.isFree && b.isFree) return 1;
                return a.id.localeCompare(b.id);
            });

            models.push(...remoteModels);
        } else if (provider === "gemini" || successfulUrl.includes("generativelanguage.googleapis.com")) {
            models = rawList
                .filter((m: any) => m.id && !m.id.includes("embedding") && !m.id.includes("aqa"))
                .map((m: any) => ({
                    id: m.id.replace(/^models\//, ""),
                    name: m.id.replace(/^models\//, "") + (m.id.includes("flash") ? " (Recommended)" : ""),
                    isFree: true,
                }));
        } else if (provider === "groq" || successfulUrl.includes("api.groq.com")) {
            models = rawList
                .filter((m: any) => m.id && !m.id.startsWith("whisper") && m.active !== false)
                .map((m: any) => ({
                    id: m.id,
                    name: `${m.name || m.id} [FREE TIER]`,
                    isFree: true,
                }));
        } else if (provider === "custom" || successfulUrl.includes("tags")) {
            models = rawList.map((m: any) => {
                if (typeof m === "string") return { id: m, name: m };
                const id = m.id || m.name || m.model || "";
                return { id, name: m.name || id };
            }).filter(m => m.id);
        } else {
            models = rawList
                .filter((m: any) => {
                    const id = (m.id || "").toLowerCase();
                    return id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("claude") || id.includes("mistral") || id.includes("llama");
                })
                .map((m: any) => ({
                    id: m.id,
                    name: m.id,
                }));
        }

        if (models.length === 0 && rawList.length > 0) {
            models = rawList.slice(0, 100).map((m: any) => {
                if (typeof m === "string") return { id: m, name: m };
                const id = m.id || m.name || m.model || String(m);
                return { id, name: m.name || id };
            }).filter(m => m.id);
        }

        return new Response(
            JSON.stringify({
                success: true,
                count: models.length,
                models,
                endpointUsed: successfulUrl,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (e: any) {
        return new Response(
            JSON.stringify({
                success: false,
                error: e.message || "Failed to fetch models from provider.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }
};
