/**
 * Gionee Pakistan - Unified Order Courier Status Synchronizer
 * Connects RS Courier portal/API tracking events with D1 orders table,
 * order timeline updates, and automated customer dispatch notifications.
 */

import { getTrackingHistory } from "./courier";
import { addTimelineEntry, getDefaultTimelineContent } from "./timeline";

export interface SyncOrderResult {
    success: boolean;
    orderId: string | number;
    order?: any;
    statusChanged: boolean;
    courierStatusChanged: boolean;
    oldStatus: string;
    newStatus: string;
    rawCourierStatus: string;
    latestEvent: any;
    error?: string;
}

/**
 * Maps RS Courier raw scan status text to store internal order status with full reverse-journey awareness
 */
export function mapCourierStatusToInternal(
    rawStatus: string,
    events?: { status?: string }[],
    originCity: string = "Sargodha"
): string | null {
    const rsStatus = (rawStatus || "").toLowerCase().trim();
    if (!rsStatus) return null;

    // 1. Delivered directly to customer takes top priority
    if (
        rsStatus.includes("delivered") && 
        !rsStatus.includes("undelivered") && 
        !rsStatus.includes("shipper") && 
        !rsStatus.includes("origin") && 
        !rsStatus.includes("warehouse")
    ) {
        return "Delivered";
    }

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
        "refused",
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

    // 2. If full event history is available, inspect chronological timeline
    if (events && events.length > 0) {
        const origin = (originCity || "Sargodha").toLowerCase().trim();
        let lastReturnIndex = -1;

        for (let i = events.length - 1; i >= 0; i--) {
            const evLower = (events[i].status || "").toLowerCase();
            if (returnKeywords.some(k => evLower.includes(k))) {
                lastReturnIndex = i;
                break;
            }
        }

        // If a return event occurred in history
        if (lastReturnIndex !== -1) {
            const postReturnEvents = events.slice(lastReturnIndex + 1);

            if (postReturnEvents.length === 0) {
                return "Returned";
            }

            // Check if any post-return event is a genuine customer delivery or destination re-attempt
            for (const ev of postReturnEvents) {
                const evLower = (ev.status || "").toLowerCase();

                if (
                    evLower.includes("delivered") &&
                    !evLower.includes("undelivered") &&
                    !evLower.includes("shipper") &&
                    !evLower.includes("origin") &&
                    !evLower.includes("warehouse")
                ) {
                    return "Delivered";
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
                    return "Shipped";
                }

                // Active delivery scan keywords at destination (NOT in origin warehouse city)
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
                    return "Shipped";
                }
            }

            // If subsequent scans are in origin city (e.g. Arrived at Station in SARGODHA) or transit back
            return "Returned";
        }
    }

    // 3. Fallback matching for single status string
    if (returnKeywords.some(k => rsStatus.includes(k))) {
        return "Returned";
    }

    if (
        rsStatus.includes("lost") || 
        rsStatus.includes("delivery unsuccessful") ||
        rsStatus.includes("cancel") || 
        rsStatus.includes("void")
    ) {
        return "Cancelled";
    }

    if (
        rsStatus.includes("re-attempt") ||
        rsStatus.includes("reattempt") ||
        rsStatus.includes("re attempt") ||
        rsStatus.includes("dispatched") || 
        rsStatus.includes("arrived at station") || 
        rsStatus.includes("assigned to courier") || 
        rsStatus.includes("shipment picked") || 
        rsStatus.includes("picked in") || 
        rsStatus.includes("picked up") ||
        rsStatus.includes("out for delivery") || 
        rsStatus.includes("transit") || 
        rsStatus.includes("arrived") || 
        rsStatus.includes("departed") ||
        rsStatus.includes("hold for self collection") ||
        rsStatus.includes("delivery in progress") ||
        rsStatus.includes("under delivery")
    ) {
        return "Shipped";
    }

    return null;
}

/**
 * Synchronizes a single order's real-time courier status against RS Courier,
 * updates D1 `orders` and `order_timeline`, and fires dispatch/return alerts.
 */
export async function syncSingleOrderTracking(
    db: any,
    env: any,
    orderInput: any,
    options?: { sendImmediateAlerts?: boolean }
): Promise<SyncOrderResult> {
    const sendImmediate = options?.sendImmediateAlerts !== false;

    if (!db) {
        return {
            success: false,
            orderId: orderInput?.id || "",
            statusChanged: false,
            courierStatusChanged: false,
            oldStatus: orderInput?.status || "",
            newStatus: orderInput?.status || "",
            rawCourierStatus: "",
            latestEvent: null,
            error: "Database not connected",
        };
    }

    let order = orderInput;
    if (typeof orderInput === "string" || typeof orderInput === "number") {
        const cleanId = String(orderInput).replace(/^#+/, "").trim();
        order = await db.prepare("SELECT * FROM orders WHERE id = ? OR id = ? LIMIT 1").bind(cleanId, `#${cleanId}`).first();
    }

    if (!order) {
        return {
            success: false,
            orderId: orderInput?.id || orderInput || "",
            statusChanged: false,
            courierStatusChanged: false,
            oldStatus: "",
            newStatus: "",
            rawCourierStatus: "",
            latestEvent: null,
            error: "Order not found",
        };
    }

    const trackingNo = (order.tracking_no || "").trim();
    if (!trackingNo) {
        return {
            success: false,
            orderId: order.id,
            order,
            statusChanged: false,
            courierStatusChanged: false,
            oldStatus: order.status,
            newStatus: order.status,
            rawCourierStatus: order.courier_status || "",
            latestEvent: null,
            error: "No tracking number assigned to this order",
        };
    }

    try {
        const trackingRes = await getTrackingHistory(trackingNo);
        if (!trackingRes.success || !trackingRes.data || trackingRes.data.length === 0) {
            // Touch updated_at so order timestamp is refreshed
            await db.prepare("UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(order.id).run().catch(() => {});
            return {
                success: false,
                orderId: order.id,
                order,
                statusChanged: false,
                courierStatusChanged: false,
                oldStatus: order.status,
                newStatus: order.status,
                rawCourierStatus: order.courier_status || "",
                latestEvent: null,
                error: trackingRes.error || "No tracking events returned from courier portal",
            };
        }

        const latestEvent = trackingRes.data[trackingRes.data.length - 1];
        const rawStatus = (latestEvent.status || trackingRes.latestStatus || "").trim();
        const mappedInternal = mapCourierStatusToInternal(rawStatus, trackingRes.data);

        const statusChanged = Boolean(mappedInternal && mappedInternal !== order.status);
        const courierStatusChanged = Boolean(rawStatus && rawStatus !== order.courier_status);
        const targetStatus = mappedInternal || order.status;

        let freshOrder = order;

        if (statusChanged && mappedInternal) {
            if (mappedInternal === "Shipped") {
                await db.prepare(`
                    UPDATE orders 
                    SET status = ?, courier_status = ?, shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).bind(mappedInternal, rawStatus, order.id).run();

                freshOrder = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first() || order;

                if (sendImmediate) {
                    try {
                        const trackingUrl = `https://gionee.com.pk/track-order/${order.id}/`;
                        const { sendShippedNotifications } = await import("./notifications");
                        await sendShippedNotifications(db, env, freshOrder, trackingNo, trackingUrl);
                    } catch (notifErr) {
                        console.error(`Failed to send dispatch notifications for #${order.id}:`, notifErr);
                    }
                }
            } else if (mappedInternal === "Delivered") {
                await db.prepare(`
                    UPDATE orders 
                    SET status = ?, courier_status = ?, delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).bind(mappedInternal, rawStatus, order.id).run();

                freshOrder = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first() || order;
            } else if (mappedInternal === "Returned") {
                await db.prepare(`
                    UPDATE orders 
                    SET status = ?, courier_status = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).bind(mappedInternal, rawStatus, order.id).run();

                freshOrder = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first() || order;

                if (sendImmediate) {
                    try {
                        const { sendOrderReturnedAlert } = await import("./whatsapp");
                        await sendOrderReturnedAlert(db, freshOrder, rawStatus);
                    } catch (alertErr) {
                        console.error(`Failed to send return alert for #${order.id}:`, alertErr);
                    }
                }
            } else {
                await db.prepare(`
                    UPDATE orders 
                    SET status = ?, courier_status = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).bind(mappedInternal, rawStatus, order.id).run();

                freshOrder = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first() || order;
            }

            const { title, description } = getDefaultTimelineContent(mappedInternal, trackingNo);
            await addTimelineEntry(db, String(order.id), mappedInternal, title, `Courier Update: ${rawStatus}. ${description}`);
        } else {
            // Update courier_status and updated_at
            await db.prepare(`
                UPDATE orders 
                SET courier_status = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).bind(rawStatus || order.courier_status || null, order.id).run().catch(() => {});
        }

        return {
            success: true,
            orderId: order.id,
            order: freshOrder,
            statusChanged,
            courierStatusChanged,
            oldStatus: order.status,
            newStatus: targetStatus,
            rawCourierStatus: rawStatus,
            latestEvent,
        };
    } catch (e: any) {
        console.error(`Error syncing order #${order.id}:`, e);
        return {
            success: false,
            orderId: order.id,
            statusChanged: false,
            courierStatusChanged: false,
            oldStatus: order.status,
            newStatus: order.status,
            rawCourierStatus: order.courier_status || "",
            latestEvent: null,
            error: e.message || "Failed to sync order",
        };
    }
}
