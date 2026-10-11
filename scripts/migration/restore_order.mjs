import fs from 'fs';
import { execSync } from 'child_process';

const DB_NAME = "gionee-v2-test";
const RESTORE_ID = "5NA54AL";

try {
    const orders = JSON.parse(fs.readFileSync('legacy_orders.json', 'utf8'));
    const order = orders.find(o => o.id === RESTORE_ID);

    if (!order) {
        console.error("Order not found in legacy_orders.json!");
        process.exit(1);
    }

    let sqlStmts = [];
    const escapeString = (str) => {
        if (!str) return '';
        return str.replace(/'/g, "''");
    };

    // Insert Order
    sqlStmts.push(
        `INSERT INTO orders (id, customer_name, customer_phone, customer_email, city, address, delivery_fee, total_amount, status, created_at) ` +
        `VALUES ('${escapeString(order.id)}', '${escapeString(order.customer_name)}', '${escapeString(order.customer_phone)}', '${escapeString(order.customer_email)}', '${escapeString(order.city)}', '${escapeString(order.address)}', ${order.delivery_fee}, ${order.total_amount}, '${escapeString(order.status)}', '${escapeString(order.created_at)}');`
    );

    // Insert Order Items
    for (const item of order.items) {
        sqlStmts.push(
            `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, pack_size_label) ` +
            `VALUES ('${escapeString(order.id)}', ${item.product_id}, '${escapeString(item.product_name)}', ${item.unit_price}, ${item.quantity}, '${escapeString(item.pack_size_label)}');`
        );
    }

    const sqlFile = 'restore.sql';
    fs.writeFileSync(sqlFile, sqlStmts.join('\n'));
    console.log(`Wrote SQL to ${sqlFile}.`);

    // Execute
    console.log("Restoring to Remote DB...");
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${sqlFile}`, { stdio: 'inherit' });

    console.log("Restoring to Local DB...");
    execSync(`npx wrangler d1 execute ${DB_NAME} --local --file=${sqlFile}`, { stdio: 'inherit' });

    console.log("Order restored successfully!");
} catch (e) {
    console.error("Failed to restore order:", e.message);
}
