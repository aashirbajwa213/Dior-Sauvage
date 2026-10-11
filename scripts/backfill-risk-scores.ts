/**
 * Gionee Pakistan - Backfill Script for Order Health & Customer Profiles
 * Processes all historical orders in local SQLite, builds customer intelligence,
 * populates city risk registries, and computes risk scores for all 816 orders.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { calculateOrderHealthScore, normalizeCityName } from "../src/utils/riskScore";

// 1. Locate local SQLite database
const miniflareDir = path.join(process.cwd(), ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const sqliteFiles = fs.readdirSync(miniflareDir).filter(f => f.endsWith(".sqlite") && !f.includes("metadata"));

if (sqliteFiles.length === 0) {
    console.error("No local SQLite database found in .wrangler");
    process.exit(1);
}

const dbPath = path.join(miniflareDir, sqliteFiles[0]);
console.log(`Connecting to local D1 SQLite: ${dbPath}`);
const db = new Database(dbPath);

console.log("\n--- STEP 1: Populating customer_profiles from historical orders ---");

// Aggregate customer stats per phone
const customerStats = db.prepare(`
    SELECT 
        customer_phone as phone,
        MAX(customer_name) as name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as total_delivered,
        SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as total_returned,
        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as total_cancelled,
        SUM(CASE WHEN status IN ('Shipped', 'Out for Delivery', 'Booked') THEN 1 ELSE 0 END) as total_in_transit,
        SUM(CASE WHEN status = 'Delivered' THEN total_amount ELSE 0 END) as lifetime_value,
        MIN(created_at) as first_order_at,
        MAX(created_at) as last_order_at
    FROM orders
    WHERE customer_phone IS NOT NULL AND customer_phone != ''
    GROUP BY customer_phone
`).all();

console.log(`Aggregated ${customerStats.length} unique customer phone numbers.`);

const insertCustomer = db.prepare(`
    INSERT OR REPLACE INTO customer_profiles (
        phone, name, total_orders, total_delivered, total_returned, total_cancelled, 
        total_in_transit, return_rate, lifetime_value, risk_tier, first_order_at, last_order_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
    for (const c of customerStats as any[]) {
        const returnRate = c.total_orders > 0 ? (c.total_returned / c.total_orders) * 100 : 0;
        let riskTier = "Neutral";
        if (c.total_orders >= 2 && c.total_returned === c.total_orders) {
            riskTier = "Serial Returner";
        } else if (returnRate >= 50 && c.total_orders >= 2) {
            riskTier = "Risky";
        } else if (c.total_delivered >= 2 && c.total_returned === 0) {
            riskTier = "VIP";
        } else if (c.total_delivered >= 1 && c.total_returned === 0) {
            riskTier = "Good";
        }

        insertCustomer.run(
            c.phone,
            c.name || "Customer",
            c.total_orders,
            c.total_delivered,
            c.total_returned,
            c.total_cancelled,
            c.total_in_transit,
            parseFloat(returnRate.toFixed(2)),
            c.lifetime_value || 0,
            riskTier,
            c.first_order_at,
            c.last_order_at
        );
    }
})();

console.log("✓ customer_profiles populated successfully.");

console.log("\n--- STEP 2: Populating city_risk_registry ---");

const cityStats = db.prepare(`
    SELECT 
        city,
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as total_delivered,
        SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as total_returned
    FROM orders
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
`).all();

const insertCity = db.prepare(`
    INSERT OR REPLACE INTO city_risk_registry (
        city_normalized, display_name, total_orders, total_delivered, total_returned, return_rate, risk_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
    for (const c of cityStats as any[]) {
        const norm = normalizeCityName(c.city);
        const returnRate = c.total_orders > 0 ? (c.total_returned / c.total_orders) * 100 : 0;
        let riskLevel = "Low";
        if (returnRate >= 45 && c.total_orders >= 3) {
            riskLevel = "Critical";
        } else if (returnRate >= 25 && c.total_orders >= 3) {
            riskLevel = "High";
        } else if (returnRate >= 18) {
            riskLevel = "Medium";
        }

        insertCity.run(
            norm,
            c.city.trim(),
            c.total_orders,
            c.total_delivered,
            c.total_returned,
            parseFloat(returnRate.toFixed(2)),
            riskLevel
        );
    }
})();

console.log("✓ city_risk_registry populated successfully.");

console.log("\n--- STEP 3: Calculating Risk Scores for all orders ---");

const allOrders = db.prepare(`
    SELECT o.id, o.customer_phone, o.city, o.address, o.status, o.total_amount, o.created_at
    FROM orders o
    ORDER BY o.created_at DESC
`).all();

console.log(`Processing risk evaluation for ${allOrders.length} orders...`);

// Pre-fetch all customer profiles into a map
const customerMap = new Map();
const allProfiles = db.prepare("SELECT * FROM customer_profiles").all();
for (const p of allProfiles as any[]) {
    customerMap.set(p.phone, {
        phone: p.phone,
        totalOrders: p.total_orders,
        totalDelivered: p.total_delivered,
        totalReturned: p.total_returned,
        totalCancelled: p.total_cancelled,
        returnRate: p.return_rate,
        blacklisted: Boolean(p.blacklisted),
        blacklistReason: p.blacklist_reason,
    });
}

// Pre-fetch items grouped by order
const allItems = db.prepare("SELECT order_id, product_name, pack_size_label FROM order_items").all();
const itemsMap = new Map<string, Array<{ productName: string; packSizeLabel: string }>>();
for (const item of allItems as any[]) {
    if (!itemsMap.has(item.order_id)) {
        itemsMap.set(item.order_id, []);
    }
    itemsMap.get(item.order_id)!.push({
        productName: item.product_name,
        packSizeLabel: item.pack_size_label,
    });
}

const insertScore = db.prepare(`
    INSERT OR REPLACE INTO order_risk_scores (
        order_id, health_score, risk_level, address_score, customer_score, city_score, product_score,
        address_flags, customer_flags, city_flags, product_flags, all_flags, recommendations,
        is_serial_returner, is_high_risk_city, is_landmark_only, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

let countProcessed = 0;
const riskBreakdown = { Low: 0, Medium: 0, High: 0, Critical: 0 };

db.transaction(() => {
    for (const order of allOrders as any[]) {
        const history = customerMap.get(order.customer_phone) || null;
        const items = itemsMap.get(order.id) || [];

        const result = calculateOrderHealthScore({
            address: order.address || "",
            city: order.city || "",
            customerHistory: history,
            items,
        });

        riskBreakdown[result.riskLevel]++;

        insertScore.run(
            order.id,
            result.healthScore,
            result.riskLevel,
            result.addressScore,
            result.customerScore,
            result.cityScore,
            result.productScore,
            JSON.stringify(result.addressFlags),
            JSON.stringify(result.customerFlags),
            JSON.stringify(result.cityFlags),
            JSON.stringify(result.productFlags),
            JSON.stringify(result.allFlags),
            JSON.stringify(result.recommendations),
            result.isSerialReturner ? 1 : 0,
            result.isHighRiskCity ? 1 : 0,
            result.isLandmarkOnly ? 1 : 0
        );

        countProcessed++;
    }
})();

console.log(`\n✅ Completed! Successfully calculated and saved scores for ${countProcessed} orders.`);
console.log("Risk Tier Breakdown:", riskBreakdown);

// Verify check
const check = db.prepare(`
    SELECT risk_level, COUNT(*) as count, ROUND(AVG(health_score), 1) as avg_score 
    FROM order_risk_scores 
    GROUP BY risk_level
`).all();
console.table(check);
