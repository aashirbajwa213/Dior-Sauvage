/**
 * Gionee Pakistan - Return Reduction & Order Health Scoring Engine
 * Deterministic, offline-safe risk calculation across:
 * 1. Address Completeness & Structure (35 pts)
 * 2. Customer Lifetime History & Return Behavior (35 pts)
 * 3. City Geographic Delivery Performance (20 pts)
 * 4. Product Compatibility & Pack Alignment (10 pts)
 */

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface RiskEvaluationResult {
    healthScore: number;       // 0 to 100
    riskLevel: RiskLevel;      // 'Low' | 'Medium' | 'High' | 'Critical'
    
    addressScore: number;      // 0 to 35
    customerScore: number;     // 0 to 35
    cityScore: number;         // 0 to 20
    productScore: number;      // 0 to 10
    
    addressFlags: string[];
    customerFlags: string[];
    cityFlags: string[];
    productFlags: string[];
    allFlags: string[];
    recommendations: string[];
    
    isSerialReturner: boolean;
    isHighRiskCity: boolean;
    isLandmarkOnly: boolean;
}

export interface CustomerHistoryRecord {
    phone: string;
    totalOrders: number;
    totalDelivered: number;
    totalReturned: number;
    totalCancelled: number;
    returnRate: number;
    blacklisted: boolean;
    blacklistReason?: string;
}

export interface CityRiskRecord {
    cityNormalized: string;
    displayName: string;
    totalOrders: number;
    totalReturned: number;
    returnRate: number;
    riskLevel: RiskLevel;
}

/**
 * Standardize city names to avoid trailing spaces and capitalization mismatches
 */
export function normalizeCityName(city: string): string {
    return (city || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Known high-risk and medium-risk cities based on real historical data
 */
export const KNOWN_CITY_STATS: Record<string, { returnRate: number; riskLevel: RiskLevel; score: number }> = {
    "kasur": { returnRate: 75.0, riskLevel: "Critical", score: 2 },
    "vehari": { returnRate: 50.0, riskLevel: "Critical", score: 5 },
    "sheikhupura": { returnRate: 40.0, riskLevel: "High", score: 8 },
    "peshawar": { returnRate: 35.3, riskLevel: "High", score: 9 },
    "rahim yar khan": { returnRate: 28.6, riskLevel: "High", score: 11 },
    "gujar khan": { returnRate: 25.0, riskLevel: "High", score: 12 },
    "sialkot": { returnRate: 23.5, riskLevel: "Medium", score: 13 },
    "mandi bahauddin": { returnRate: 20.0, riskLevel: "Medium", score: 14 },
    "jhang": { returnRate: 20.0, riskLevel: "Medium", score: 14 },
    "rawalpindi": { returnRate: 17.0, riskLevel: "Medium", score: 15 },
    "islamabad": { returnRate: 15.3, riskLevel: "Low", score: 17 },
    "lahore": { returnRate: 15.2, riskLevel: "Low", score: 17 },
    "karachi": { returnRate: 14.7, riskLevel: "Low", score: 17 },
    "hyderabad": { returnRate: 14.3, riskLevel: "Low", score: 18 },
    "multan": { returnRate: 12.0, riskLevel: "Low", score: 19 },
    "faisalabad": { returnRate: 10.0, riskLevel: "Low", score: 19 },
    "sargodha": { returnRate: 8.0, riskLevel: "Low", score: 20 },
};

/**
 * Evaluates Address Completeness & Clarity (Max 35 points)
 */
export function evaluateAddress(address: string, city: string): {
    score: number;
    flags: string[];
    isLandmarkOnly: boolean;
} {
    const raw = (address || "").trim();
    const flags: string[] = [];
    let score = 35;
    let isLandmarkOnly = false;

    // 1. Length check
    if (raw.length < 15) {
        score -= 15;
        flags.push("Address is critically short (< 15 characters)");
    } else if (raw.length < 25) {
        score -= 8;
        flags.push("Address is brief (< 25 characters)");
    }

    // 2. House / Flat / Shop / Plot number detection
    const hasHouseNo = /(house|h[#\.\-\s]|flat|f[#\.\-\s]|shop|plot|p[#\.\-\s]|room|office|banglow|kothi|suite|plaza|bldg|building|\b\d+[\/\-]\d+|\b\d{1,5}\b)/i.test(raw);
    if (!hasHouseNo) {
        score -= 10;
        flags.push("Missing specific House / Flat / Shop / Building number");
    }

    // 3. Street / Road / Block / Sector / Mohalla / Gali detection
    const hasStreet = /(street|st[#\.\-\s]|road|rd[#\.\-\s]|gali|sector|sec[#\.\-\s]|block|phase|mohalla|colony|town|avenue|lane|scheme|bazar|market|housing|clifton|defence|dha|bahria)/i.test(raw);
    if (!hasStreet) {
        score -= 8;
        flags.push("Missing Street / Gali / Block / Area structure");
    }

    // 4. Landmark-only detection (e.g. "near royal school", "opp masjid", without specific house/street)
    const hasOnlyLandmarks = /(near|opp|opposite|samnay|front of|behind|chowk|morr|pull|phatak|masjid|mosque|school|college|hospital|graveyard|stop|stand|chok)/i.test(raw);
    if (hasOnlyLandmarks && (!hasHouseNo || raw.length < 30)) {
        score -= 6;
        isLandmarkOnly = true;
        flags.push("Address relies primarily on public landmarks rather than door delivery details");
    }

    // 5. Courier Office Pickup detection (TCS/Leopards self-collection)
    if (/(tcs office|leopards office|postex office|courier office|rider call me|self collection|station pickup)/i.test(raw)) {
        score -= 5;
        flags.push("Consignee requested courier hub collection");
    }

    return {
        score: Math.max(0, Math.min(35, score)),
        flags,
        isLandmarkOnly,
    };
}

/**
 * Evaluates Customer Past Ordering Behavior (Max 35 points)
 */
export function evaluateCustomer(history?: CustomerHistoryRecord | null): {
    score: number;
    flags: string[];
    isSerialReturner: boolean;
} {
    let score = 35;
    const flags: string[] = [];
    let isSerialReturner = false;

    if (!history || history.totalOrders <= 1) {
        // First-time or new customer: Neutral score (28 out of 35)
        return {
            score: 28,
            flags: ["First-time buyer on this phone number"],
            isSerialReturner: false,
        };
    }

    // If blacklisted
    if (history.blacklisted) {
        flags.push(`Customer is Blacklisted: ${history.blacklistReason || "High return history"}`);
        return {
            score: 0,
            flags,
            isSerialReturner: true,
        };
    }

    // Serial Returner Check: 100% returns across 2+ orders
    if (history.totalOrders >= 2 && history.totalReturned === history.totalOrders) {
        isSerialReturner = true;
        score = 0;
        flags.push(`Serial Returner: ${history.totalReturned} out of ${history.totalOrders} past orders returned (100% return rate)`);
        return { score, flags, isSerialReturner };
    }

    // Return Rate Calculations
    if (history.returnRate >= 60) {
        score -= 25;
        flags.push(`Elevated Return History: ${history.returnRate.toFixed(1)}% past return rate (${history.totalReturned} returned)`);
    } else if (history.returnRate >= 30) {
        score -= 15;
        flags.push(`Moderate Return History: ${history.returnRate.toFixed(1)}% past return rate (${history.totalReturned} returned)`);
    } else if (history.totalDelivered >= 2 && history.totalReturned === 0) {
        score = 35; // Perfect VIP customer
        flags.push(`Trusted Buyer: ${history.totalDelivered} successfully delivered orders`);
    }

    return {
        score: Math.max(0, Math.min(35, score)),
        flags,
        isSerialReturner,
    };
}

/**
 * Evaluates Destination City Delivery Performance (Max 20 points)
 */
export function evaluateCity(city: string): {
    score: number;
    flags: string[];
    isHighRiskCity: boolean;
} {
    const norm = normalizeCityName(city);
    const flags: string[] = [];
    let score = 16; // default neutral city score
    let isHighRiskCity = false;

    const known = KNOWN_CITY_STATS[norm];
    if (known) {
        score = known.score;
        if (known.riskLevel === "Critical" || known.riskLevel === "High") {
            isHighRiskCity = true;
            flags.push(`High Return Hub: ${city} has a historical ${known.returnRate.toFixed(0)}% return rate`);
        }
    } else if (!norm || norm.length < 3) {
        score = 8;
        isHighRiskCity = true;
        flags.push("Unrecognized or missing destination city");
    }

    return {
        score: Math.max(0, Math.min(20, score)),
        flags,
        isHighRiskCity,
    };
}

/**
 * Evaluates Product Compatibility & Pack Alignment (Max 10 points)
 */
export function evaluateProduct(items?: Array<{ productName?: string; packSizeLabel?: string }>): {
    score: number;
    flags: string[];
} {
    let score = 10;
    const flags: string[] = [];

    if (!items || items.length === 0) {
        return { score, flags };
    }

    // Check connector type ambiguity
    const hasTypeC = items.some(i => (i.productName || "").toLowerCase().includes("type-c") || (i.productName || "").toLowerCase().includes("type c"));
    const has35mm = items.some(i => (i.productName || "").toLowerCase().includes("3.5mm") || (i.productName || "").toLowerCase().includes("3.5"));

    if (hasTypeC) {
        flags.push("Type-C connector: Ensure customer smartphone does NOT have a 3.5mm headphone jack");
    }

    if (hasTypeC && has35mm) {
        score -= 3;
        flags.push("Mixed Connectors: Order contains both 3.5mm and Type-C units");
    }

    return {
        score: Math.max(0, Math.min(10, score)),
        flags,
    };
}

/**
 * Master Health Evaluator: Combines all signals into a 0 to 100 Health Score
 */
export function calculateOrderHealthScore(params: {
    address: string;
    city: string;
    customerHistory?: CustomerHistoryRecord | null;
    items?: Array<{ productName?: string; packSizeLabel?: string }>;
}): RiskEvaluationResult {
    const addressEval = evaluateAddress(params.address, params.city);
    const customerEval = evaluateCustomer(params.customerHistory);
    const cityEval = evaluateCity(params.city);
    const productEval = evaluateProduct(params.items);

    // Sum component scores (Max = 35 + 35 + 20 + 10 = 100)
    let totalScore = addressEval.score + customerEval.score + cityEval.score + productEval.score;

    // Hard ceiling if serial returner or blacklisted
    if (customerEval.isSerialReturner) {
        totalScore = Math.min(totalScore, 30);
    }

    // Determine Risk Level Tier
    let riskLevel: RiskLevel = "Low";
    if (totalScore < 40) {
        riskLevel = "Critical";
    } else if (totalScore < 60) {
        riskLevel = "High";
    } else if (totalScore < 80) {
        riskLevel = "Medium";
    } else {
        riskLevel = "Low";
    }

    const allFlags = [
        ...customerEval.flags,
        ...addressEval.flags,
        ...cityEval.flags,
        ...productEval.flags,
    ];

    const recommendations: string[] = [];
    if (riskLevel === "Critical") {
        recommendations.push("🚨 HOLD BOOKING: Call customer to verify before generating courier slip.");
    }
    if (customerEval.isSerialReturner) {
        recommendations.push("⚠️ Serial returner detected. Require advance delivery fee or verbal confirmation.");
    }
    if (addressEval.isLandmarkOnly) {
        recommendations.push("📍 Ask customer for complete House/Shop # and Street name via WhatsApp.");
    }
    if (cityEval.isHighRiskCity) {
        recommendations.push("🚚 City has high return rates. Remind customer to keep cash ready.");
    }
    if (allFlags.some(f => f.includes("Type-C"))) {
        recommendations.push("🔌 Confirm customer has a Type-C audio port phone.");
    }

    return {
        healthScore: Math.max(0, Math.min(100, Math.round(totalScore))),
        riskLevel,
        addressScore: addressEval.score,
        customerScore: customerEval.score,
        cityScore: cityEval.score,
        productScore: productEval.score,
        addressFlags: addressEval.flags,
        customerFlags: customerEval.flags,
        cityFlags: cityEval.flags,
        productFlags: productEval.flags,
        allFlags,
        recommendations,
        isSerialReturner: customerEval.isSerialReturner,
        isHighRiskCity: cityEval.isHighRiskCity,
        isLandmarkOnly: addressEval.isLandmarkOnly,
    };
}
