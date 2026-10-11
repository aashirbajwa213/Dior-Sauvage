/**
 * RS Courier API Client for Gionee Pakistan
 * Integrates with https://portal.rscourier.pk/API/
 * All credentials are fetched dynamically from the D1 `settings` table.
 */

import { getAllSettings, saveSetting, type SystemSettings } from "./settings";

const RS_COURIER_BASE_URL = "https://portal.rscourier.pk/API";

export interface CourierOrderPayload {
    receiverName: string;
    receiverPhone: string;
    receiverEmail: string;
    receiverAddress: string;
    destinationCity: string;
    pieces: number;
    weight: number;
    collectionAmount: number;       // COD amount
    productDescription: string;
    orderId: string;
    specialInstruction?: string;
}

export interface CourierCreateResponse {
    tracking_no: string | number;
    thirdparty_tracking_no: string | null;
    thirdparty_name: string | null;
    id: number;
    invoice_link: string;
    message: string;
}

export interface CourierTrackingEvent {
    tracking_no: string;
    status: string;
    created: string;
}

export interface CourierCurrentStatus {
    tracking_no: string;
    status: string;
    created: string;
}

export interface CourierServiceOption {
    code: string;
    label: string;
    recommended?: boolean;
}

export interface CourierProviderProfile {
    id: string;
    name: string;
    vendorId: string;
    product: string;
    serviceType: string;
    description: string;
    logo: string;
    services: CourierServiceOption[];
}

/**
 * Standard operational courier provider profiles configured on RS Courier.
 * Verified via live merchant tariff testing.
 */
export const COURIER_PROVIDERS: Record<string, CourierProviderProfile> = {
    postex: {
        id: "postex",
        name: "PostEx",
        vendorId: "36",
        product: "Overnight Post Ex",
        serviceType: "Overnight",
        description: "PostEx 2.0 network via RS Courier",
        logo: "/images/couriers/postex.png",
        services: [
            { code: "Overnight", label: "Overnight (Recommended)", recommended: true }
        ]
    },
    leopards: {
        id: "leopards",
        name: "Leopards Courier",
        vendorId: "11",
        product: "Overnight Leopards",
        serviceType: "Detain",
        description: "Leopards Courier nationwide COD",
        logo: "/images/couriers/leopards.png",
        services: [
            { code: "Detain", label: "Detain (Active RS Tariff)", recommended: true }
        ]
    },
    trax: {
        id: "trax",
        name: "Trax Logistics",
        vendorId: "12",
        product: "Overnight Trax",
        serviceType: "Overnight",
        description: "Trax Express logistics",
        logo: "/images/couriers/trax.png",
        services: [
            { code: "Overnight", label: "Overnight (Recommended)", recommended: true }
        ]
    },
    mnp: {
        id: "mnp",
        name: "M&P Express",
        vendorId: "18",
        product: "Overnight M&P",
        serviceType: "Overnight",
        description: "M&P domestic express delivery",
        logo: "/images/couriers/mnp.png",
        services: [
            { code: "Overnight", label: "Overnight (Recommended)", recommended: true }
        ]
    },
    dastaq: {
        id: "dastaq",
        name: "Dastaq Logistics",
        vendorId: "35",
        product: "Overnight Dastaq",
        serviceType: "Overnight",
        description: "Overnight COD via Dastaq Logistics",
        logo: "/images/couriers/dastaq.png",
        services: [
            { code: "Overnight", label: "Overnight (Recommended)", recommended: true }
        ]
    },
    auto: {
        id: "auto",
        name: "Auto (RS Courier Decision)",
        vendorId: "auto",
        product: "Overnight",
        serviceType: "Overnight",
        description: "Let RS Courier portal dynamically select the provider",
        logo: "/images/couriers/rscourier.png",
        services: [
            { code: "Overnight", label: "Overnight (Recommended)", recommended: true }
        ]
    }
};

/**
 * Map friendly provider names, keys, and IDs to canonical provider profiles
 */
export function resolveProviderProfile(
    providerOrVendorKey?: string,
    fallbackSettings?: SystemSettings
): { vendorId: string; product: string; serviceType: string; profileId: string } {
    const key = (providerOrVendorKey || "").trim().toLowerCase();

    // Helper to get service type from fallbackSettings if set, else provider default
    const getServiceForProfile = (p: CourierProviderProfile): string => {
        if (fallbackSettings) {
            const settingKey = `courier_service_${p.id}` as keyof SystemSettings;
            const customService = fallbackSettings[settingKey];
            if (customService && typeof customService === "string") {
                return customService;
            }
        }
        return p.serviceType;
    };

    // Direct profile match
    if (key && COURIER_PROVIDERS[key]) {
        const p = COURIER_PROVIDERS[key];
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }

    // Friendly vendor name or ID match
    if (key === "36" || key.includes("postex") || key.includes("post ex")) {
        const p = COURIER_PROVIDERS.postex;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }
    if (key === "11" || key === "5" || key.includes("leopard")) {
        const p = COURIER_PROVIDERS.leopards;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }
    if (key === "12" || key.includes("trax")) {
        const p = COURIER_PROVIDERS.trax;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }
    if (key === "18" || key.includes("m&p") || key.includes("mnp")) {
        const p = COURIER_PROVIDERS.mnp;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }
    if (key === "35" || key.includes("dastaq")) {
        const p = COURIER_PROVIDERS.dastaq;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }
    if (key === "auto") {
        const p = COURIER_PROVIDERS.auto;
        return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
    }

    // Fallback: check fallback settings
    if (fallbackSettings) {
        const defaultKey = (fallbackSettings.courier_default_provider || "").toLowerCase();
        if (defaultKey && COURIER_PROVIDERS[defaultKey]) {
            const p = COURIER_PROVIDERS[defaultKey];
            return { vendorId: p.vendorId, product: p.product, serviceType: getServiceForProfile(p), profileId: p.id };
        }
        return {
            vendorId: fallbackSettings.courier_api_vendor || "auto",
            product: fallbackSettings.courier_product_type || "Overnight",
            serviceType: fallbackSettings.courier_service_type || "Overnight",
            profileId: "custom"
        };
    }

    return { vendorId: "36", product: "Overnight Post Ex", serviceType: "Overnight", profileId: "postex" };
}

export interface CourierProviderDisplayInfo {
    id: string;
    name: string;
    logo: string;
    trackingUrl: string;
}

/**
 * Returns comprehensive courier provider display info including name, logo, and tracking URL.
 */
export function getCourierProviderInfo(providerOrVendor?: string, trackingNo?: string, defaultProvider?: string): CourierProviderDisplayInfo {
    const cleanTracking = (trackingNo || "").trim().toUpperCase();
    const cleanTrackingOrig = (trackingNo || "").trim();
    let key = (providerOrVendor || "").trim().toLowerCase();

    // 1. Check explicit tracking number patterns (highest fidelity)
    if (
        cleanTracking.startsWith("SA") || 
        cleanTracking.startsWith("KI") || 
        cleanTracking.startsWith("LE") || 
        cleanTracking.startsWith("LHR") || 
        cleanTracking.startsWith("KHI")
    ) {
        return {
            id: "leopards",
            name: "Leopards Courier",
            logo: "/images/couriers/leopards.png",
            trackingUrl: "https://pk.leopardscourier.com/shipment_tracking_view"
        };
    }

    if (
        cleanTracking.startsWith("217") || 
        cleanTracking.startsWith("287") || 
        cleanTracking.startsWith("277") || 
        cleanTracking.startsWith("237") || 
        cleanTracking.startsWith("297") || 
        cleanTracking.startsWith("207") || 
        (cleanTracking.length === 14 && cleanTracking.startsWith("2"))
    ) {
        return {
            id: "postex",
            name: "PostEx",
            logo: "/images/couriers/postex.png",
            trackingUrl: cleanTrackingOrig ? `https://postex.pk/tracking?cn=${encodeURIComponent(cleanTrackingOrig)}` : "https://postex.pk"
        };
    }

    if (cleanTracking.startsWith("302") || cleanTracking.startsWith("TRAX") || (cleanTracking.length >= 10 && cleanTracking.startsWith("3"))) {
        return {
            id: "trax",
            name: "Trax Logistics",
            logo: "/images/couriers/trax.png",
            trackingUrl: cleanTrackingOrig ? `https://sonic.pk/tracking?tracking_number=${encodeURIComponent(cleanTrackingOrig)}` : "https://sonic.pk"
        };
    }

    if (cleanTracking.startsWith("562") || cleanTracking.startsWith("MNP") || (cleanTracking.length >= 10 && cleanTracking.startsWith("5"))) {
        return {
            id: "mnp",
            name: "M&P Express",
            logo: "/images/couriers/mnp.png",
            trackingUrl: cleanTrackingOrig ? `https://www.mulphilog.com/tracking?tracking_no=${encodeURIComponent(cleanTrackingOrig)}` : "https://www.mulphilog.com"
        };
    }

    if (cleanTracking.startsWith("DAS") || cleanTracking.startsWith("DQ")) {
        return {
            id: "dastaq",
            name: "Dastaq Logistics",
            logo: "/images/couriers/dastaq.png",
            trackingUrl: "https://www.dastaqlogistics.com/"
        };
    }

    // 2. Check explicit saved provider key from order
    if (key === "leopards" || key === "11" || key === "5" || key.includes("leopard")) {
        return {
            id: "leopards",
            name: "Leopards Courier",
            logo: "/images/couriers/leopards.png",
            trackingUrl: "https://pk.leopardscourier.com/shipment_tracking_view"
        };
    }
    if (key === "postex" || key === "36" || key.includes("postex")) {
        return {
            id: "postex",
            name: "PostEx",
            logo: "/images/couriers/postex.png",
            trackingUrl: cleanTrackingOrig ? `https://postex.pk/tracking?cn=${encodeURIComponent(cleanTrackingOrig)}` : "https://postex.pk"
        };
    }
    if (key === "trax" || key === "12" || key.includes("trax")) {
        return {
            id: "trax",
            name: "Trax Logistics",
            logo: "/images/couriers/trax.png",
            trackingUrl: cleanTrackingOrig ? `https://sonic.pk/tracking?tracking_number=${encodeURIComponent(cleanTrackingOrig)}` : "https://sonic.pk"
        };
    }
    if (key === "mnp" || key === "18" || key.includes("mnp") || key.includes("m&p")) {
        return {
            id: "mnp",
            name: "M&P Express",
            logo: "/images/couriers/mnp.png",
            trackingUrl: cleanTrackingOrig ? `https://www.mulphilog.com/tracking?tracking_no=${encodeURIComponent(cleanTrackingOrig)}` : "https://www.mulphilog.com"
        };
    }
    if (key === "dastaq" || key === "35" || key.includes("dastaq")) {
        return {
            id: "dastaq",
            name: "Dastaq Logistics",
            logo: "/images/couriers/dastaq.png",
            trackingUrl: "https://www.dastaqlogistics.com/"
        };
    }

    // 3. Check if key matches known profile in COURIER_PROVIDERS
    if (key && COURIER_PROVIDERS[key]) {
        const p = COURIER_PROVIDERS[key];
        return {
            id: p.id,
            name: p.name,
            logo: p.logo,
            trackingUrl: cleanTrackingOrig ? `https://portal.rscourier.pk/track-details.php?track_code=${encodeURIComponent(cleanTrackingOrig)}` : "https://portal.rscourier.pk/tracking.php"
        };
    }

    // 4. Fallback to defaultProvider from settings
    if (defaultProvider) {
        const dKey = defaultProvider.trim().toLowerCase();
        if (dKey === "leopards" || dKey === "11" || dKey.includes("leopard")) {
            return {
                id: "leopards",
                name: "Leopards Courier",
                logo: "/images/couriers/leopards.png",
                trackingUrl: "https://pk.leopardscourier.com/shipment_tracking_view"
            };
        }
        if (dKey === "postex" || dKey === "36" || dKey.includes("postex")) {
            return {
                id: "postex",
                name: "PostEx",
                logo: "/images/couriers/postex.png",
                trackingUrl: cleanTrackingOrig ? `https://postex.pk/tracking?cn=${encodeURIComponent(cleanTrackingOrig)}` : "https://postex.pk"
            };
        }
    }

    // 5. Default fallback to PostEx
    return {
        id: "postex",
        name: "PostEx",
        logo: "/images/couriers/postex.png",
        trackingUrl: cleanTrackingOrig ? `https://postex.pk/tracking?cn=${encodeURIComponent(cleanTrackingOrig)}` : "https://postex.pk"
    };
}

/**
 * Returns the official tracking URL for a given tracking number and courier provider
 */
export function getCourierTrackingUrl(providerOrVendor?: string, trackingNo?: string, defaultProvider?: string): string {
    return getCourierProviderInfo(providerOrVendor, trackingNo, defaultProvider).trackingUrl;
}

/**
 * Returns human-readable courier provider name
 */
export function getCourierProviderName(providerOrVendor?: string, trackingNo?: string, defaultProvider?: string): string {
    return getCourierProviderInfo(providerOrVendor, trackingNo, defaultProvider).name;
}

/**
 * Top Pakistani cities fallback when cache is empty
 */
export const DEFAULT_TOP_CITIES = [
    "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta",
    "Sialkot", "Gujranwala", "Sargodha", "Bahawalpur", "Sukkur", "Larkana", "Sheikhupura",
    "Jhang", "Rahim Yar Khan", "Gujrat", "Mardan", "Kasur", "Dera Ghazi Khan", "Sahiwal",
    "Nawabshah", "Okara", "Mirpur Khas", "Chiniot", "Kamoke", "Mandi Bahauddin", "Burewala",
    "Jacobabad", "Muzaffargarh", "Muridke", "Jhelum", "Khanpur", "Hafizabad", "Kohat",
    "Khanewal", "Daska", "Gojra", "Bahawalnagar", "Abbottabad", "Murree", "Wah Cantonment",
    "Chakwal", "Swat", "Nowshera", "Attock", "Kotli", "Muzaffarabad", "Mirpur Azad Kashmir"
];

/**
 * Normalizes destination city to match RS Courier accepted naming
 */
export function normalizeDestinationCity(
    inputCity: string,
    validCities: string[] = []
): { normalizedCity: string; isValid: boolean; matchedCity?: string } {
    if (!inputCity) {
        return { normalizedCity: "", isValid: false };
    }

    let cleaned = inputCity.trim().replace(/[\r\n\t]/g, " ").replace(/[,.\-_]+$/, "").trim();

    // Known common abbreviations and alternate spellings in Pakistan
    const cityAliases: Record<string, string> = {
        "lhr": "Lahore",
        "isb": "Islamabad",
        "rwp": "Rawalpindi",
        "khi": "Karachi",
        "fsd": "Faisalabad",
        "mul": "Multan",
        "pew": "Peshawar",
        "qta": "Quetta",
        "sgd": "Sargodha",
        "shekhupura": "Sheikhupura",
        "sheikhupura ": "Sheikhupura",
        "sheikhupura city": "Sheikhupura",
        "wah cantt": "Wah Cantonment",
        "wah cantonment": "Wah Cantonment",
        "mirpur a.k": "Mirpur Azad Kashmir",
        "mirpur ak": "Mirpur Azad Kashmir",
        "d.g khan": "Dera Ghazi Khan",
        "dg khan": "Dera Ghazi Khan",
        "d.i khan": "Dera Ismail Khan",
        "di khan": "Dera Ismail Khan",
        "t.t singh": "Toba Tek Singh",
        "tt singh": "Toba Tek Singh"
    };

    const lowerCleaned = cleaned.toLowerCase();
    if (cityAliases[lowerCleaned]) {
        cleaned = cityAliases[lowerCleaned];
    }

    // Check against valid cities list
    const candidateList = (validCities && validCities.length > 0) ? validCities : DEFAULT_TOP_CITIES;
    const lowerCandidateMap = new Map<string, string>();
    for (const c of candidateList) {
        if (c && typeof c === "string") {
            lowerCandidateMap.set(c.trim().toLowerCase(), c.trim());
        }
    }

    const matched = lowerCandidateMap.get(cleaned.toLowerCase());
    if (matched) {
        return { normalizedCity: matched, isValid: true, matchedCity: matched };
    }

    // Substring boundary matching
    for (const [lowerName, canonical] of lowerCandidateMap.entries()) {
        if (lowerName.length >= 4 && (cleaned.toLowerCase().includes(` ${lowerName}`) || cleaned.toLowerCase().includes(`${lowerName} `))) {
            return { normalizedCity: canonical, isValid: true, matchedCity: canonical };
        }
    }

    return { normalizedCity: cleaned, isValid: false };
}

/**
 * Fetches the list of excluded cities (hidden from frontend checkout) from D1 settings
 */
export async function getExcludedCourierCities(db: any): Promise<string[]> {
    if (!db) return [];
    try {
        const settings = await getAllSettings(db);
        if (settings.courier_excluded_cities) {
            const parsed = JSON.parse(settings.courier_excluded_cities);
            if (Array.isArray(parsed)) {
                return parsed.map((c: any) => String(c).trim()).filter(Boolean);
            }
        }
    } catch (e) {
        console.error("Failed to read excluded courier cities:", e);
    }
    return [];
}

/**
 * Saves the list of excluded cities to D1 settings
 */
export async function setExcludedCourierCities(db: any, cities: string[]): Promise<boolean> {
    if (!db) return false;
    try {
        const cleanList = Array.from(new Set(
            cities.map(c => (c || "").trim()).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b));

        return await saveSetting(db, "courier_excluded_cities", JSON.stringify(cleanList));
    } catch (e) {
        console.error("Failed to save excluded courier cities:", e);
        return false;
    }
}

/**
 * Fetches cached operational cities from D1 settings.
 * If `includeExcluded` is false (e.g. for frontend checkout), filters out blacklisted cities.
 */
export async function getCachedCourierCities(db: any, includeExcluded: boolean = true): Promise<string[]> {
    if (!db) return DEFAULT_TOP_CITIES;
    try {
        const settings = await getAllSettings(db);
        let cities = DEFAULT_TOP_CITIES;
        if (settings.courier_cached_cities) {
            const parsed = JSON.parse(settings.courier_cached_cities);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cities = parsed;
            }
        }

        if (!includeExcluded) {
            const excluded = await getExcludedCourierCities(db);
            if (excluded.length > 0) {
                const excludedSet = new Set(excluded.map(e => e.trim().toLowerCase()));
                return cities.filter(c => !excludedSet.has(c.trim().toLowerCase()));
            }
        }

        return cities;
    } catch (e) {
        console.error("Failed to read cached courier cities:", e);
    }
    return DEFAULT_TOP_CITIES;
}

/**
 * Synchronizes operational cities directly from RS Courier API
 * and caches them in the D1 `settings` table.
 */
export async function syncCourierCities(db: any): Promise<{
    success: boolean;
    count: number;
    cities: string[];
    error?: string;
}> {
    if (!db) {
        return { success: false, count: 0, cities: [], error: "Database binding missing." };
    }

    try {
        const settings = await getAllSettings(db);
        if (!settings.courier_auth_key) {
            return { success: false, count: 0, cities: [], error: "RS Courier Auth Key is missing in settings." };
        }

        const citySet = new Set<string>();

        // 1. Fetch Standard Cities via GetCitiesList.php
        try {
            const listUrl = `${RS_COURIER_BASE_URL}/GetCitiesList.php?auth_key=${encodeURIComponent(settings.courier_auth_key)}`;
            const res = await fetch(listUrl, { headers: { "User-Agent": "Gionee-PK-Portal/1.0" } });
            if (res.ok) {
                const data: any = await res.json();
                const rawCities = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
                for (const item of rawCities) {
                    const name = (item?.city_name || item?.name || "").trim();
                    if (name && name !== "#N/A" && name.length > 1) {
                        citySet.add(name);
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching GetCitiesList:", err);
        }

        // 2. Fetch Merchant Profile Cities via ProductAndService.php
        try {
            const psUrl = `${RS_COURIER_BASE_URL}/ProductAndService.php`;
            const psRes = await fetch(psUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auth_key: settings.courier_auth_key })
            });
            if (psRes.ok) {
                const psData: any = await psRes.json();
                if (Array.isArray(psData?.cities)) {
                    for (const c of psData.cities) {
                        const name = (c?.city_name || "").trim();
                        if (name && name !== "#N/A" && name.length > 1) {
                            citySet.add(name);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching ProductAndService cities:", err);
        }

        // Ensure default top cities are included
        for (const c of DEFAULT_TOP_CITIES) {
            citySet.add(c);
        }

        const sortedCities = Array.from(citySet).sort((a, b) => a.localeCompare(b));

        if (sortedCities.length > 0) {
            const jsonString = JSON.stringify(sortedCities);
            const nowPKT = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" })).toISOString();

            await saveSetting(db, "courier_cached_cities", jsonString);
            await saveSetting(db, "courier_cities_last_synced", nowPKT);

            return {
                success: true,
                count: sortedCities.length,
                cities: sortedCities
            };
        } else {
            return {
                success: false,
                count: 0,
                cities: [],
                error: "No cities were returned by the RS Courier API."
            };
        }
    } catch (e: any) {
        console.error("Failed to sync RS Courier cities:", e);
        return { success: false, count: 0, cities: [], error: e.message };
    }
}

/**
 * Creates a domestic order with RS Courier and returns the tracking number.
 * Automatically resolves provider profile and normalizes the destination city.
 */
export async function createCourierOrder(
    db: any,
    payload: CourierOrderPayload,
    providerOverride?: string
): Promise<{ success: boolean; data?: CourierCreateResponse; error?: string; providerUsed?: string }> {
    try {
        const settings = await getAllSettings(db);

        if (!settings.courier_enabled) {
            return { success: false, error: "RS Courier integration is disabled in settings." };
        }
        if (!settings.courier_auth_key || !settings.courier_client_code) {
            return { success: false, error: "RS Courier API credentials are not configured. Go to Admin → Settings." };
        }

        // Resolve Provider Profile (e.g. PostEx vs Leopards vs Trax)
        const chosenProvider = providerOverride || settings.courier_default_provider || settings.courier_api_vendor;
        const resolved = resolveProviderProfile(chosenProvider, settings);

        // Normalize destination city against cached cities
        const cachedCities = await getCachedCourierCities(db);
        const { normalizedCity } = normalizeDestinationCity(payload.destinationCity, cachedCities);
        const finalDestination = normalizedCity || payload.destinationCity.trim();

        const body = {
            client_code: settings.courier_client_code,
            auth_key: settings.courier_auth_key,
            service_type: resolved.serviceType,
            product: resolved.product,
            profile_id: settings.courier_profile_id,
            origin: settings.courier_origin_city || "Sargodha",
            receiver_phone: payload.receiverPhone,
            destination: finalDestination,
            receiver_name: (payload.receiverName || "").toUpperCase(),
            receiver_email: payload.receiverEmail || "",
            receiver_address: payload.receiverAddress,
            pieces: payload.pieces || 1,
            tracking_no: "",                   // empty = auto-generate
            weight: parseFloat(settings.courier_default_weight) || 0.5,
            order_date: new Date().toISOString().replace("T", " ").substring(0, 19),
            collection_amount: String(payload.collectionAmount),
            product_description: payload.productDescription,
            special_instruction: payload.specialInstruction || settings.courier_special_instructions || "CALL BEFORE DELIVERY",
            order_id: `#${payload.orderId}`,
            ref_no: "",
            api_vendor: resolved.vendorId
        };

        const response = await fetch(`${RS_COURIER_BASE_URL}/CreateOrder.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const text = await response.text();
        let data: any = null;
        let isError = !response.ok;
        if (!isError) {
            try { data = JSON.parse(text); } catch (e) { isError = true; }
        }

        const errorMessage = isError
            ? `RS Courier API returned HTTP ${response.status}: ${text}`
            : (data?.tracking_no ? null : (data?.message || `No tracking number returned. Response: ${text}`));

        try {
            await db.prepare(`
                INSERT INTO rs_courier_logs (action, order_id, tracking_no, payload, response, error) 
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                `CreateOrder (${resolved.profileId})`, 
                `#${payload.orderId}`, 
                data?.tracking_no || null, 
                JSON.stringify(body), 
                data ? JSON.stringify(data) : null, 
                errorMessage
            ).run();
        } catch (e) {
            console.error("Failed to insert courier log:", e);
        }

        if (data && data.tracking_no) {
            return { success: true, data, providerUsed: resolved.profileId };
        } else {
            return { success: false, error: errorMessage || "Unknown error", providerUsed: resolved.profileId };
        }
    } catch (e: any) {
        console.error("RS Courier CreateOrder failed:", e);
        return { success: false, error: `Network error: ${e.message}` };
    }
}

/**
 * Runs a live diagnostic test booking for a specified provider,
 * and immediately cancels it via CancelOrder.php so no live parcel remains.
 */
export async function testCourierBooking(
    db: any,
    providerId: string,
    testCity: string = "Lahore"
): Promise<{
    success: boolean;
    trackingNo?: string;
    requestPayload: any;
    apiResponse: any;
    cancelMessage?: string;
    error?: string;
}> {
    try {
        const settings = await getAllSettings(db);
        const resolved = resolveProviderProfile(providerId, settings);

        const cachedCities = await getCachedCourierCities(db);
        const { normalizedCity } = normalizeDestinationCity(testCity, cachedCities);

        const testOrderId = `#TEST${Date.now().toString().slice(-6)}`;
        const body = {
            client_code: settings.courier_client_code,
            auth_key: settings.courier_auth_key,
            service_type: resolved.serviceType,
            product: resolved.product,
            profile_id: settings.courier_profile_id,
            origin: settings.courier_origin_city || "Sargodha",
            receiver_phone: "03001234567",
            destination: normalizedCity || testCity,
            receiver_name: "DIAGNOSTIC TEST BOOKING",
            receiver_email: "test@example.com",
            receiver_address: "Automated Connection Test - Will be cancelled immediately",
            pieces: 1,
            tracking_no: "",
            weight: parseFloat(settings.courier_default_weight) || 0.5,
            order_date: new Date().toISOString().replace("T", " ").substring(0, 19),
            collection_amount: "10",
            product_description: "Diagnostic Test Item",
            special_instruction: "DIAGNOSTIC TEST DO NOT SHIP",
            order_id: testOrderId,
            ref_no: "",
            api_vendor: resolved.vendorId
        };

        const response = await fetch(`${RS_COURIER_BASE_URL}/CreateOrder.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) { data = text; }

        if (data && data.tracking_no) {
            const trackingNo = String(data.tracking_no);
            // Cancel immediately
            const cancelRes = await cancelCourierOrder(db, trackingNo);
            return {
                success: true,
                trackingNo,
                requestPayload: body,
                apiResponse: data,
                cancelMessage: cancelRes.success ? "Test parcel automatically cancelled successfully." : "Created, but cancel failed: " + cancelRes.error
            };
        } else {
            return {
                success: false,
                requestPayload: body,
                apiResponse: data,
                error: typeof data === "string" ? data : (data?.message || "Failed to create test booking.")
            };
        }
    } catch (e: any) {
        return {
            success: false,
            requestPayload: null,
            apiResponse: null,
            error: e.message
        };
    }
}

/**
 * Scrapes and parses the real-time tracking events directly from the official RS Courier customer portal:
 * https://portal.rscourier.pk/track-details.php?track_code={code}
 * This provides 100% accurate checkpoint history (Picked, Arrived at Hub, Dispatched, Delivered, Returned).
 */
export async function parseRSCourierPortalTracking(trackingNo: string): Promise<{
    success: boolean;
    data: CourierTrackingEvent[];
    latestStatus?: string;
    consignee?: string;
    destination?: string;
    shipper?: string;
    error?: string;
}> {
    const clean = (trackingNo || "").trim();
    if (!clean) {
        return { success: false, data: [], error: "Empty tracking number" };
    }

    try {
        const url = `https://portal.rscourier.pk/track-details.php?track_code=${encodeURIComponent(clean)}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        if (!response.ok) {
            return { success: false, data: [], error: `RS Courier portal returned HTTP ${response.status}` };
        }

        const html = await response.text();
        const tableMatch = html.match(/<table[^>]*class=["']table_info["'][^>]*>([\s\S]*?)<\/table>/i);

        if (!tableMatch) {
            return { success: false, data: [], error: "No tracking details found on RS Courier portal." };
        }

        const events: CourierTrackingEvent[] = [];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let row;
        while ((row = rowRegex.exec(tableMatch[1])) !== null) {
            const cells: string[] = [];
            const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cell;
            while ((cell = cellRegex.exec(row[1])) !== null) {
                const text = cell[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
                cells.push(text);
            }
            if (cells.length >= 2) {
                events.push({
                    created: cells[0],
                    status: cells[1],
                    tracking_no: clean,
                });
            }
        }

        const nameMatch = html.match(/<b>\s*Name:\s*<\/b>\s*([^<]+)/i);
        const destMatch = html.match(/<b>\s*Destination:\s*<\/b>\s*([^<]+)/i);
        const shipperMatch = html.match(/<b>\s*Shipper:\s*<\/b>\s*([^<]+)/i);

        const latestStatus = events.length > 0 ? events[events.length - 1].status : undefined;

        return {
            success: events.length > 0,
            data: events,
            latestStatus,
            consignee: nameMatch ? nameMatch[1].trim() : undefined,
            destination: destMatch ? destMatch[1].trim() : undefined,
            shipper: shipperMatch ? shipperMatch[1].trim() : undefined,
        };
    } catch (e: any) {
        console.error(`Failed to parse RS Courier portal tracking for ${clean}:`, e);
        return { success: false, data: [], error: e.message || "Network error querying RS Courier portal" };
    }
}

/**
 * Fetches the full tracking history for a given tracking number.
 * First queries the real-time RS Courier portal (track-details.php) for live accurate status,
 * and seamlessly falls back to the API endpoint if needed.
 */
export async function getTrackingHistory(
    trackingNo: string
): Promise<{
    success: boolean;
    data?: CourierTrackingEvent[];
    error?: string;
    latestStatus?: string;
    destination?: string;
    consignee?: string;
    shipper?: string;
}> {
    const clean = (trackingNo || "").trim();
    if (!clean) {
        return { success: false, error: "Missing tracking number" };
    }

    // 1. Try real-time portal endpoint first
    try {
        const portalRes = await parseRSCourierPortalTracking(clean);
        if (portalRes.success && portalRes.data.length > 0) {
            return {
                success: true,
                data: portalRes.data,
                latestStatus: portalRes.latestStatus,
                destination: portalRes.destination,
                consignee: portalRes.consignee,
                shipper: portalRes.shipper,
            };
        }
    } catch (portalErr) {
        console.warn(`Portal tracking fetch failed for ${clean}, falling back to API:`, portalErr);
    }

    // 2. Fallback to API TrackOrder.php
    try {
        const response = await fetch(`${RS_COURIER_BASE_URL}/TrackOrder.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracking_no: clean })
        });

        if (!response.ok) {
            return { success: false, error: `RS Courier TrackOrder returned HTTP ${response.status}` };
        }

        const data: CourierTrackingEvent[] = await response.json();
        const latestStatus = Array.isArray(data) && data.length > 0 ? data[data.length - 1].status : undefined;
        return { success: true, data, latestStatus };
    } catch (e: any) {
        console.error("RS Courier TrackOrder failed:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Cancels an order with RS Courier based on its tracking number.
 */
export async function cancelCourierOrder(
    db: any,
    trackingNo: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const settings = await getAllSettings(db);

        if (!settings.courier_auth_key) {
            return { success: false, error: "RS Courier API credentials are not configured." };
        }

        const url = `${RS_COURIER_BASE_URL}/CancelOrder.php?auth_key=${encodeURIComponent(settings.courier_auth_key)}&tracking_no=${encodeURIComponent(trackingNo)}`;
        
        const response = await fetch(url, { method: "GET" });

        const text = await response.text();
        let data: any = null;
        let isError = !response.ok;
        if (!isError) {
            try { data = JSON.parse(text); } catch(e) { isError = true; }
        }

        const isCancelled = data && data.message && data.message.toLowerCase().includes("cancelled");
        const errorMessage = isError ? `RS Courier CancelOrder returned HTTP ${response.status}: ${text}` : (isCancelled ? null : (data?.message || "Failed to cancel order via API."));

        try {
            await db.prepare(`
                INSERT INTO rs_courier_logs (action, order_id, tracking_no, payload, response, error) 
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                "CancelOrder", 
                null, 
                trackingNo, 
                null, // No payload for GET
                data ? JSON.stringify(data) : null, 
                errorMessage
            ).run();
        } catch(e) {
            console.error("Failed to insert courier log:", e);
        }

        if (isCancelled) {
            return { success: true };
        } else {
            return { success: false, error: errorMessage || "Unknown error" };
        }
    } catch (e: any) {
        console.error("RS Courier CancelOrder failed:", e);
        return { success: false, error: `Network error: ${e.message}` };
    }
}

/**
 * Fetches the current status of an RS Courier shipment.
 */
export async function getCurrentStatus(
    trackingNo: string
): Promise<{ success: boolean; data?: CourierCurrentStatus; error?: string }> {
    try {
        const response = await fetch(`${RS_COURIER_BASE_URL}/CurrentStatus.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracking_no: trackingNo })
        });

        if (!response.ok) {
            return { success: false, error: `RS Courier CurrentStatus returned HTTP ${response.status}` };
        }

        const data = await response.json();
        // API returns array, take first element
        const status = Array.isArray(data) ? data[0] : data;
        return { success: true, data: status };
    } catch (e: any) {
        console.error("RS Courier CurrentStatus failed:", e);
        return { success: false, error: e.message };
    }
}


