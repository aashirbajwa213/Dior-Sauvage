import { calculateOrderHealthScore } from './riskScore';

/**
 * Real-Time Instant Order Health Scoring & Customer CRM Sync
 * Runs synchronously when:
 * 1. Customer places order on checkout (instant, 0s delay)
 * 2. Admin creates manual booking (instant, 0s delay)
 * 3. Admin opens any order detail page where score wasn't calculated yet (instant on page load)
 */
export async function syncOrderRiskAndCustomer(db: any, orderId: string) {
    if (!db || !orderId) return null;

    try {
        // 1. Fetch current order
        const order = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first();
        if (!order) return null;

        const phone = (order.customer_phone || '').trim();
        const city = (order.city || '').trim();
        const address = (order.address || '').trim();

        // 2. Real-time Customer CRM sync
        let customerProfile: any = null;
        if (phone) {
            const existingProfile = await db.prepare(`SELECT * FROM customer_profiles WHERE phone = ?`).bind(phone).first();
            const isBlacklisted = existingProfile?.blacklisted ? 1 : 0;
            const blacklistReason = existingProfile?.blacklist_reason || null;
            const adminNotes = existingProfile?.admin_notes || null;

            const agg: any = await db.prepare(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as total_delivered,
                    SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as total_returned,
                    SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as total_cancelled,
                    SUM(CASE WHEN status IN ('Pending', 'Confirmed', 'Shipped', 'Booked') THEN 1 ELSE 0 END) as total_in_transit,
                    SUM(CASE WHEN status = 'Delivered' THEN total_amount ELSE 0 END) as lifetime_value,
                    MIN(created_at) as first_order_at,
                    MAX(created_at) as last_order_at
                FROM orders 
                WHERE customer_phone = ?
            `).bind(phone).first();

            const totalOrders = agg?.total_orders || 1;
            const totalDelivered = agg?.total_delivered || 0;
            const totalReturned = agg?.total_returned || 0;
            const totalCancelled = agg?.total_cancelled || 0;
            const totalInTransit = agg?.total_in_transit || 0;
            const lifetimeValue = agg?.lifetime_value || 0;
            const firstOrderAt = agg?.first_order_at || order.created_at;
            const lastOrderAt = agg?.last_order_at || order.created_at;

            const completed = totalDelivered + totalReturned;
            const returnRate = completed > 0 
                ? Math.round((totalReturned / completed) * 1000) / 10 
                : 0.0;

            let riskTier = 'Neutral';
            if (isBlacklisted) {
                riskTier = 'Blacklisted';
            } else if (totalOrders === 1) {
                riskTier = 'Neutral';
            } else if (completed > 0 && returnRate >= 60) {
                riskTier = 'Serial Returner';
            } else if (completed > 0 && returnRate >= 40) {
                riskTier = 'Risky';
            } else if (totalDelivered >= 3 && totalReturned === 0) {
                riskTier = 'VIP';
            } else if (totalDelivered >= 2) {
                riskTier = 'Good';
            } else {
                riskTier = 'Neutral';
            }

            await db.prepare(`
                INSERT OR REPLACE INTO customer_profiles (
                    phone, name, city, email,
                    total_orders, total_delivered, total_returned, total_cancelled, total_in_transit,
                    return_rate, lifetime_value, risk_tier,
                    blacklisted, blacklist_reason, admin_notes,
                    first_order_at, last_order_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
                phone,
                order.customer_name || existingProfile?.name || 'Customer',
                city || existingProfile?.city || '',
                order.customer_email || existingProfile?.email || null,
                totalOrders,
                totalDelivered,
                totalReturned,
                totalCancelled,
                totalInTransit,
                returnRate,
                lifetimeValue,
                riskTier,
                isBlacklisted,
                blacklistReason,
                adminNotes,
                firstOrderAt,
                lastOrderAt
            ).run();

            customerProfile = {
                phone,
                totalOrders,
                totalDelivered,
                totalReturned,
                totalCancelled,
                returnRate,
                riskTier,
                blacklisted: Boolean(isBlacklisted),
                blacklistReason
            };
        }

        // 3. Real-time City Risk Registry sync
        if (city) {
            const cityAgg: any = await db.prepare(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as total_delivered,
                    SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as total_returned
                FROM orders
                WHERE LOWER(TRIM(city)) = LOWER(TRIM(?))
            `).bind(city).first();

            const cOrders = cityAgg?.total_orders || 1;
            const cDelivered = cityAgg?.total_delivered || 0;
            const cReturned = cityAgg?.total_returned || 0;
            const cCompleted = cDelivered + cReturned;
            const cReturnRate = cCompleted > 0 
                ? Math.round((cReturned / cCompleted) * 1000) / 10 
                : 0.0;

            let cRiskLevel = 'Low';
            if (cCompleted > 0 && cReturnRate >= 50) cRiskLevel = 'High';
            else if (cCompleted > 0 && cReturnRate >= 30) cRiskLevel = 'Medium';

            await db.prepare(`
                INSERT OR REPLACE INTO city_risk_registry (
                    city_normalized, display_name,
                    total_orders, total_delivered, total_returned,
                    return_rate, risk_level, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
                city.toLowerCase(),
                city,
                cOrders,
                cDelivered,
                cReturned,
                cReturnRate,
                cRiskLevel
            ).run();
        }

        // 4. Calculate Order Health Score immediately
        const { results: items } = await db.prepare(`
            SELECT product_name, pack_size_label 
            FROM order_items 
            WHERE order_id = ?
        `).bind(orderId).all();

        const scoreRes = calculateOrderHealthScore({
            address,
            city,
            customerHistory: customerProfile ? {
                phone: customerProfile.phone,
                totalOrders: customerProfile.totalOrders,
                totalDelivered: customerProfile.totalDelivered,
                totalReturned: customerProfile.totalReturned,
                totalCancelled: customerProfile.totalCancelled,
                returnRate: customerProfile.returnRate,
                blacklisted: customerProfile.blacklisted,
                blacklistReason: customerProfile.blacklistReason
            } : null,
            items: (items || []).map((i: any) => ({
                productName: i.product_name,
                packSizeLabel: i.pack_size_label
            }))
        });

        // 5. Save to order_risk_scores table immediately
        await db.prepare(`
            INSERT OR REPLACE INTO order_risk_scores (
                order_id, health_score, risk_level,
                address_score, customer_score, city_score, product_score,
                address_flags, customer_flags, city_flags, product_flags, all_flags,
                recommendations, is_serial_returner, is_high_risk_city, is_landmark_only,
                calculated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            orderId,
            scoreRes.healthScore,
            scoreRes.riskLevel,
            scoreRes.addressScore,
            scoreRes.customerScore,
            scoreRes.cityScore,
            scoreRes.productScore,
            JSON.stringify(scoreRes.addressFlags),
            JSON.stringify(scoreRes.customerFlags),
            JSON.stringify(scoreRes.cityFlags),
            JSON.stringify(scoreRes.productFlags),
            JSON.stringify(scoreRes.allFlags),
            JSON.stringify(scoreRes.recommendations),
            scoreRes.isSerialReturner ? 1 : 0,
            scoreRes.isHighRiskCity ? 1 : 0,
            scoreRes.isLandmarkOnly ? 1 : 0
        ).run();

        return {
            orderId,
            healthScore: scoreRes.healthScore,
            riskLevel: scoreRes.riskLevel,
            scoreRes,
            customerProfile
        };
    } catch (err: any) {
        console.error(`Error calculating real-time risk for order #${orderId}:`, err);
        return null;
    }
}
