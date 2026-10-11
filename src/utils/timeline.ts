/**
 * Order Timeline Helper Module for Gionee Pakistan Automation
 * Manages the `order_timeline` table in Cloudflare D1
 */

export interface TimelineEntry {
    id?: number;
    order_id: string;
    status: string;
    title: string;
    description: string;
    created_at?: string;
}

/**
 * Adds a new milestone or event to an order's timeline
 */
export async function addTimelineEntry(
    db: any,
    orderId: string,
    status: string,
    title: string,
    description: string
): Promise<boolean> {
    if (!db) {
        console.error("D1 Database connection is missing in timeline utility.");
        return false;
    }

    try {
        await db.prepare(`
            INSERT INTO order_timeline (order_id, status, title, description, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .bind(orderId, status, title, description)
        .run();
        
        return true;
    } catch (e: any) {
        console.error(`Failed to add timeline entry for order #${orderId}:`, e.message);
        return false;
    }
}

/**
 * Fetches the complete history of timeline events for a specific order
 */
export async function getTimelineForOrder(db: any, orderId: string): Promise<TimelineEntry[]> {
    if (!db) return [];
    try {
        const { results } = await db.prepare(`
            SELECT * FROM order_timeline
            WHERE order_id = ?
            ORDER BY created_at ASC
        `)
        .bind(orderId)
        .all();
        
        return results || [];
    } catch (e: any) {
        console.error(`Failed to get timeline for order #${orderId}:`, e.message);
        return [];
    }
}

/**
 * Utility to map order status list to human-friendly default title and description
 */
export function getDefaultTimelineContent(status: string, trackingNo?: string): { title: string; description: string } {
    switch (status) {
        case "Pending":
            return {
                title: "Order Placed",
                description: "Your order has been received and is currently pending confirmation."
            };
        case "Confirmed":
            return {
                title: "Order Confirmed",
                description: "Your order has been verified and confirmed."
            };
        case "Booked":
            return {
                title: "Shipment Booked",
                description: trackingNo
                    ? `Your shipment has been booked. Tracking Number: ${trackingNo}`
                    : "Your order is being prepared for dispatch and a shipping label has been generated."
            };
        case "Returned":
            return {
                title: "Order Returned",
                description: "This parcel has been returned to the sender."
            };
        case "Shipped":
            return {
                title: "Order Dispatched",
                description: trackingNo 
                    ? `Your order has been shipped via RS Courier. Tracking Number: ${trackingNo}`
                    : "Your order has been packed and handed over to our shipping partner."
            };
        case "Delivered":
            return {
                title: "Order Delivered",
                description: "Your parcel has been successfully delivered. Thank you for shopping with us!"
            };
        case "Cancelled":
            return {
                title: "Order Cancelled",
                description: "Your order has been cancelled."
            };
        default:
            return {
                title: `Status: ${status}`,
                description: `Order status changed to ${status}.`
            };
    }
}
