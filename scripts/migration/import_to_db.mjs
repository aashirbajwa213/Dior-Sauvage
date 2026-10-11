import fs from 'fs';
import { execSync } from 'child_process';

const DB_NAME = "gionee-v2-test";

async function main() {
    console.log('Reading legacy_orders.json...');
    if (!fs.existsSync('legacy_orders.json')) {
        console.error('legacy_orders.json not found! Run fetch_emails.mjs first.');
        return;
    }

    const orders = JSON.parse(fs.readFileSync('legacy_orders.json', 'utf8'));
    console.log(`Found ${orders.length} orders to import.`);

    let sqlStmts = [];

    const escapeString = (str) => {
        if (!str) return '';
        return str.replace(/'/g, "''");
    };

    for (const order of orders) {
        // Insert Order
        sqlStmts.push(
            `INSERT OR IGNORE INTO orders (id, customer_name, customer_phone, customer_email, city, address, delivery_fee, total_amount, status, created_at) ` +
            `VALUES ('${escapeString(order.id)}', '${escapeString(order.customer_name)}', '${escapeString(order.customer_phone)}', '${escapeString(order.customer_email)}', '${escapeString(order.city)}', '${escapeString(order.address)}', ${order.delivery_fee}, ${order.total_amount}, '${escapeString(order.status)}', '${escapeString(order.created_at)}');`
        );

        // Insert Order Items
        for (const item of order.items) {
            sqlStmts.push(
                `INSERT OR IGNORE INTO order_items (order_id, product_id, product_name, unit_price, quantity, pack_size_label) ` +
                `VALUES ('${escapeString(order.id)}', ${item.product_id}, '${escapeString(item.product_name)}', ${item.unit_price}, ${item.quantity}, '${escapeString(item.pack_size_label)}');`
            );
        }
    }

    if (sqlStmts.length > 0) {
        const sqlFile = 'migration.sql';
        fs.writeFileSync(sqlFile, sqlStmts.join('\n'));
        console.log(`Wrote SQL to ${sqlFile}.`);
        console.log(`Running Wrangler to execute SQL on D1...`);
        
        try {
            // Local DB execution
            console.log("Executing against local D1...");
            execSync(`npx wrangler d1 execute ${DB_NAME} --local --file=${sqlFile}`, { stdio: 'inherit' });
            
            // Remote DB execution
            console.log("Executing against remote D1...");
            execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${sqlFile}`, { stdio: 'inherit' });
            
            console.log('Import successful!');
        } catch (e) {
            console.error('Failed to execute SQL', e);
        }
    } else {
        console.log('No SQL generated. Is legacy_orders.json empty?');
    }
}

main().catch(console.error);
