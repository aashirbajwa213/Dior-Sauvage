import type { APIRoute } from "astro";
import { getTrackingHistory, type CourierTrackingEvent } from "../../../../utils/courier";
import { addTimelineEntry } from "../../../../utils/timeline";
import { getAllSettings } from "../../../../utils/settings";

/**
 * Chronologically inspects tracking history to distinguish between:
 * 1. Customer Delivery: Parcel was delivered to the customer (Delivered)
 * 2. Active Re-Attempt: Parcel was re-assigned to courier at destination after a return event (Shipped)
 * 3. Return Journey (RTO): Parcel is on its way back or arrived at origin warehouse (Returned)
 */
function classifyReturnedOrderHistory(
    events: CourierTrackingEvent[],
    originCity: string = "Sargodha"
): {
    status: "Delivered" | "Shipped" | "Returned";
    reason: string;
    latestEvent: CourierTrackingEvent;
} {
    if (!events || events.length === 0) {
        return { status: "Returned", reason: "No tracking events recorded", latestEvent: null as any };
    }

    const latestEvent = events[events.length - 1];
    const latestStatus = (latestEvent.status || "").trim();
    const latestLower = latestStatus.toLowerCase();
    const origin = (originCity || "Sargodha").toLowerCase().trim();

    // 1. Delivered directly to customer
    if (
        latestLower.includes("delivered") &&
        !latestLower.includes("undelivered") &&
        !latestLower.includes("shipper") &&
        !latestLower.includes("origin") &&
        !latestLower.includes("warehouse")
    ) {
        return {
            status: "Delivered",
            reason: `Parcel successfully delivered to customer: "${latestStatus}"`,
            latestEvent
        };
    }

    // 2. Identify return checkpoints in event history
    const returnKeywords = [
        // --- Standard & RS Courier / Leopards Return Scans ---
        "ready for return",
        "return to origin",
        "return in process",
        "return confirmation",
        "parcel return to office",
        "return received at origin",
        "returned to shipper",
        "returned to origin",
        "refused to accept",
        "consignee refused",
        "refused with no reason",
        "refused after",
        "no such consignee",
        "delayed delivery",
        "cash not available",
        "customer refused",
        "rto confirmed",
        "rto",
        "return",

        // --- PostEx Specific Return Scans (Add new PostEx return scan keywords here) ---
        "return initiated",
        "returned to warehouse",
        "return requested",
        "rto initiated",
        "rto in transit",
        "delivery failed - return",
        "consignee unavailable - return",
        "customer rejected",
        "undelivered - returning",
        "rto delivered",
        /* [POSTEX RETURN SCANS HOOK] -> Add future PostEx return scan keywords here */
    ];

    let lastReturnIndex = -1;
    for (let i = events.length - 1; i >= 0; i--) {
        const evLower = (events[i].status || "").toLowerCase();
        if (returnKeywords.some(k => evLower.includes(k))) {
            lastReturnIndex = i;
            break;
        }
    }

    // If no explicit return keyword found, fallback to latest event analysis
    if (lastReturnIndex === -1) {
        if (
            latestLower.includes("re-attempt") ||
            latestLower.includes("reattempt") ||
            latestLower.includes("out for delivery") ||
            latestLower.includes("assigned to rider") ||
            latestLower.includes("in delivery")
        ) {
            return { status: "Shipped", reason: `Active delivery: "${latestStatus}"`, latestEvent };
        }
        return { status: "Returned", reason: `Current scan: "${latestStatus}"`, latestEvent };
    }

    // 3. Inspect events occurring AFTER the last return event
    const postReturnEvents = events.slice(lastReturnIndex + 1);

    if (postReturnEvents.length === 0) {
        // The latest event IS the return event itself
        return {
            status: "Returned",
            reason: `Parcel is in return status: "${latestStatus}"`,
            latestEvent
        };
    }

    // Check post-return events: Did it get assigned for re-attempt or delivered at destination?
    for (const ev of postReturnEvents) {
        const evLower = (ev.status || "").toLowerCase();

        // If delivered to customer after return event
        if (
            evLower.includes("delivered") &&
            !evLower.includes("undelivered") &&
            !evLower.includes("shipper") &&
            !evLower.includes("origin") &&
            !evLower.includes("warehouse")
        ) {
            return {
                status: "Delivered",
                reason: `Recovered and delivered: "${ev.status}"`,
                latestEvent: ev
            };
        }

        // Explicit re-attempt scan keywords (RS Courier / PostEx / Universal)
        const reattemptKeywords = [
            "re-attempt",
            "reattempt",
            "re attempt",
            "re-schedule",
            "rescheduled",
            "re-scheduled",
            "hold for self collection",
            // --- PostEx Specific Re-attempt Scans (Add new PostEx re-attempt keywords here) ---
            "re-dispatch",
            "redispatch",
            "re-attempt scheduled",
            "reattempt requested",
            "attempting again",
            "scheduled for tomorrow",
            /* [POSTEX RE-ATTEMPT SCANS HOOK] -> Add future PostEx re-attempt keywords here */
        ];

        if (reattemptKeywords.some(k => evLower.includes(k))) {
            return {
                status: "Shipped",
                reason: `Explicit re-attempt initiated: "${ev.status}"`,
                latestEvent: ev
            };
        }

        // Assigned to courier / Out for delivery / In Delivery at destination (NOT in origin warehouse city)
        const destinationActiveKeywords = [
            "assigned to courier",
            "assigned to rider",
            "out for delivery",
            "in delivery",
            "delivery sheet assigned",
            // --- PostEx Specific Active Delivery Scans ---
            "rider assigned",
            "with courier",
            /* [POSTEX ACTIVE DELIVERY HOOK] -> Add future PostEx active keywords here */
        ];

        if (
            destinationActiveKeywords.some(k => evLower.includes(k)) &&
            !evLower.includes(origin)
        ) {
            return {
                status: "Shipped",
                reason: `Parcel re-assigned to courier at destination: "${ev.status}"`,
                latestEvent: ev
            };
        }
    }

    // Any scan involving origin city (e.g. "Arrived at Station in SARGODHA", "Dispatched to SARGODHA", "Delivered to Shipper")
    // or general transit scans during return trip mean the parcel is on its reverse journey back to the warehouse!
    return {
        status: "Returned",
        reason: `Parcel on return journey back to origin warehouse (${latestStatus})`,
        latestEvent
    };
}

const handleSyncReturned: APIRoute = async ({ request, locals }) => {
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    const customHeader = request.headers.get("x-cron-token") || request.headers.get("x-api-key");
    const token = url.searchParams.get("token") || 
                  url.searchParams.get("key") || 
                  url.searchParams.get("secret") || 
                  customHeader || 
                  authHeader?.replace("Bearer ", "").trim();

    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: "Database binding missing" }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Validate secret token if configured in Cloudflare env or D1 settings
    let cronSecret = locals.runtime?.env?.CRON_SECRET || import.meta.env.CRON_SECRET;
    if (!cronSecret || cronSecret === "missing_key") {
        try {
            const dbSecret = await db.prepare("SELECT value FROM settings WHERE key = 'cron_secret' OR key = 'sync_tracking_secret' LIMIT 1").first();
            if (dbSecret?.value) cronSecret = dbSecret.value;
        } catch (e) {}
    }

    if (cronSecret && cronSecret !== "missing_key" && token !== cronSecret) {
        return new Response(JSON.stringify({ 
            error: "Unauthorized", 
            message: "A secret token is required. Pass ?token=YOUR_SECRET or header 'Authorization: Bearer YOUR_SECRET' or 'x-cron-token'." 
        }), { 
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // Ensure columns exist in D1 schema
        await db.prepare("ALTER TABLE orders ADD COLUMN courier_status TEXT").run().catch(() => {});
        await db.prepare("ALTER TABLE orders ADD COLUMN delivered_at TEXT").run().catch(() => {});
        await db.prepare("ALTER TABLE orders ADD COLUMN updated_at TEXT").run().catch(() => {});

        // Fetch settings for origin city
        const settings = await getAllSettings(db);
        const originCity = settings.courier_origin_city || "Sargodha";

        // Fetch Returned orders created or updated within the last 14 days
        const limitParam = parseInt(url.searchParams.get("limit") || "25", 10);
        const batchLimit = Math.min(Math.max(limitParam, 1), 50);

        const { results: returnedOrders } = await db.prepare(`
            SELECT id, tracking_no, status, courier_provider, customer_phone, customer_name, city, courier_status, created_at, updated_at
            FROM orders 
            WHERE (status = 'Returned' OR (status = 'Shipped' AND courier_status LIKE '%return%'))
              AND tracking_no IS NOT NULL 
              AND tracking_no != ''
              AND (
                  COALESCE(updated_at, created_at) >= datetime('now', '-14 days')
                  OR created_at >= datetime('now', '-14 days')
              )
            ORDER BY COALESCE(updated_at, created_at) ASC 
            LIMIT ?
        `).bind(batchLimit).all();

        const recovered: any[] = [];
        const stillReturned: any[] = [];
        const errors: any[] = [];

        for (let i = 0; i < (returnedOrders || []).length; i++) {
            const order = returnedOrders[i];
            
            // Polite 300ms delay between fetches to prevent courier API rate limits
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            try {
                const trackingRes = await getTrackingHistory(order.tracking_no);
                if (!trackingRes.success || !trackingRes.data || trackingRes.data.length === 0) {
                    await db.prepare("UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(order.id).run().catch(() => {});
                    errors.push({
                        orderId: order.id,
                        trackingNo: order.tracking_no,
                        error: trackingRes.error || "No tracking events found"
                    });
                    continue;
                }

                const classification = classifyReturnedOrderHistory(trackingRes.data, originCity);
                const rawStatus = (classification.latestEvent?.status || trackingRes.latestStatus || "").trim();

                if (classification.status === "Delivered") {
                    // Parcel was successfully delivered to customer after re-attempt!
                    await db.prepare(`
                        UPDATE orders 
                        SET status = 'Delivered', courier_status = ?, delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `).bind(rawStatus, order.id).run();

                    await addTimelineEntry(
                        db, 
                        String(order.id), 
                        "Delivered", 
                        "Order Delivered (Recovered from Return)", 
                        `Parcel was successfully delivered after courier re-attempt. Courier Scan: "${rawStatus}".`
                    );

                    recovered.push({
                        orderId: order.id,
                        customerName: order.customer_name,
                        trackingNo: order.tracking_no,
                        previousStatus: order.status,
                        newStatus: "Delivered",
                        action: "Recovered → Delivered",
                        courierScan: rawStatus,
                        reason: classification.reason,
                        timestamp: classification.latestEvent?.created || new Date().toISOString()
                    });
                } else if (classification.status === "Shipped") {
                    // Genuine active re-attempt at destination city
                    await db.prepare(`
                        UPDATE orders 
                        SET status = 'Shipped', courier_status = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `).bind(rawStatus, order.id).run();

                    await addTimelineEntry(
                        db, 
                        String(order.id), 
                        "Shipped", 
                        "Re-Attempt Delivery In Progress (Recovered from Return)", 
                        `Courier initiated parcel re-attempt at destination. Courier Scan: "${rawStatus}".`
                    );

                    recovered.push({
                        orderId: order.id,
                        customerName: order.customer_name,
                        trackingNo: order.tracking_no,
                        previousStatus: order.status,
                        newStatus: "Shipped",
                        action: "Recovered → Re-Attempt Active (Shipped)",
                        courierScan: rawStatus,
                        reason: classification.reason,
                        timestamp: classification.latestEvent?.created || new Date().toISOString()
                    });
                } else {
                    // Still Returned / Reverse journey to warehouse
                    await db.prepare(`
                        UPDATE orders 
                        SET status = 'Returned', courier_status = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `).bind(rawStatus || order.courier_status || "Returned", order.id).run().catch(() => {});

                    stillReturned.push({
                        orderId: order.id,
                        customerName: order.customer_name,
                        trackingNo: order.tracking_no,
                        courierScan: rawStatus,
                        reason: classification.reason,
                        timestamp: classification.latestEvent?.created || new Date().toISOString()
                    });
                }
            } catch (err: any) {
                console.error(`Error checking returned order #${order.id}:`, err);
                errors.push({
                    orderId: order.id,
                    trackingNo: order.tracking_no,
                    error: err.message
                });
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Returned Orders Sync: Checked ${returnedOrders?.length || 0} returned orders (last 14 days). ${recovered.length} recovered to Active/Delivered, ${stillReturned.length} confirmed on return/reverse journey.`, 
            totalChecked: returnedOrders?.length || 0,
            recoveredCount: recovered.length,
            stillReturnedCount: stillReturned.length,
            errorCount: errors.length,
            recovered,
            stillReturned,
            errors
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Sync returned error:", e);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }
};

export const GET: APIRoute = handleSyncReturned;
export const POST: APIRoute = handleSyncReturned;
