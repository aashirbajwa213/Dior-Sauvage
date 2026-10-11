import type { APIRoute } from "astro";
import { syncSingleOrderTracking } from "../../../../utils/orderSync";

export const GET: APIRoute = async ({ request, locals }) => {
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
        await db.prepare("ALTER TABLE orders ADD COLUMN shipped_at TEXT").run().catch(() => {});
        await db.prepare("ALTER TABLE orders ADD COLUMN delivered_at TEXT").run().catch(() => {});
        await db.prepare("ALTER TABLE orders ADD COLUMN updated_at TEXT").run().catch(() => {});

        // Fetch up to 15 active orders that are not yet Delivered, Cancelled, or Returned.
        // Sorted by COALESCE(updated_at, created_at) ASC so every order gets checked in continuous rotation!
        const limitParam = parseInt(url.searchParams.get("limit") || "15", 10);
        const batchLimit = Math.min(Math.max(limitParam, 1), 25);

        const { results: activeOrders } = await db.prepare(`
            SELECT id, tracking_no, status, courier_provider, customer_phone, customer_name, city, courier_status
            FROM orders 
            WHERE status IN ('Booked', 'Shipped') 
              AND tracking_no IS NOT NULL 
              AND tracking_no != ''
            ORDER BY COALESCE(updated_at, created_at) ASC 
            LIMIT ?
        `).bind(batchLimit).all();

        const updates: any[] = [];
        const checked: any[] = [];
        const errors: any[] = [];
        const returnedOrdersToAlert: any[] = [];

        for (let i = 0; i < (activeOrders || []).length; i++) {
            const order = activeOrders[i];
            
            // Polite 350ms delay between fetches to prevent rate limiting
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 350));
            }

            // Suppress immediate individual alert in loop so we consolidate multiple returned orders into 1 single message
            const syncRes = await syncSingleOrderTracking(db, locals.runtime?.env, order, { sendImmediateAlerts: false });
            if (syncRes.success) {
                if (syncRes.statusChanged) {
                    updates.push({
                        orderId: order.id,
                        oldStatus: syncRes.oldStatus,
                        newStatus: syncRes.newStatus,
                        courierScan: syncRes.rawCourierStatus,
                        timestamp: syncRes.latestEvent?.created
                    });

                    // If order became Returned, add to consolidated batch alert list
                    if (syncRes.newStatus === "Returned") {
                        returnedOrdersToAlert.push({
                            id: order.id,
                            customer_name: order.customer_name,
                            customer_phone: order.customer_phone,
                            city: order.city,
                            tracking_no: order.tracking_no,
                            courier_provider: order.courier_provider,
                            courier_status: syncRes.rawCourierStatus,
                            return_reason: syncRes.rawCourierStatus
                        });
                    }
                } else {
                    checked.push({
                        orderId: order.id,
                        status: order.status,
                        courierScan: syncRes.rawCourierStatus,
                        timestamp: syncRes.latestEvent?.created
                    });
                }
            } else {
                errors.push({
                    orderId: order.id,
                    trackingNo: order.tracking_no,
                    error: syncRes.error || "No tracking details found on courier portal."
                });
            }
        }

        // Send consolidated WhatsApp Return Alert for all returned orders in this execution in a single message
        if (returnedOrdersToAlert.length > 0) {
            try {
                const { sendReturnedOrdersBatchAlert } = await import("../../../../utils/whatsapp");
                await sendReturnedOrdersBatchAlert(db, returnedOrdersToAlert);
            } catch (alertErr) {
                console.error("Failed to send consolidated return alert for batch:", alertErr);
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Sync completed: ${updates.length} updated, ${checked.length} unchanged, ${errors.length} unconfirmed.`, 
            processed: activeOrders?.length || 0,
            updatedCount: updates.length,
            updates,
            checked,
            errors
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Sync tracking error:", e);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }
};
