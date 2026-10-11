import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { execSync } from 'child_process';

const DB_NAME = "gionee-v2-test";
const CSV_FILE = "automations/order_1779620310.csv";

function normalizePhone(phone) {
    if (!phone) return "";
    let clean = phone.replace(/['\s-]/g, '');
    if (clean.startsWith('92')) {
        clean = '0' + clean.substring(2);
    } else if (clean.startsWith('+92')) {
        clean = '0' + clean.substring(3);
    }
    return clean;
}

function mapStatus(rsStatus) {
    if (!rsStatus) return "Pending";
    const s = rsStatus.toLowerCase();
    if (s.includes('deliver')) return "Delivered";
    if (s.includes('return')) return "Returned";
    if (s.includes('transit') || s.includes('dispatch') || s.includes('out for delivery')) return "Shipped";
    if (s.includes('book') || s.includes('arrive')) return "Booked";
    if (s.includes('cancel')) return "Cancelled";
    return "Pending";
}

try {
    const fileContent = fs.readFileSync(CSV_FILE, 'utf8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    console.log(`Loaded ${records.length} records from CSV.`);

    let sqlStmts = [];
    let matchCount = 0;

    for (const row of records) {
        const trackingNo = row['Tracking No']?.trim();
        const rawPhone = row['Delivery Phone'] || '';
        const rsStatus = row['Status']?.trim() || '';

        const phone = normalizePhone(rawPhone);

        if (!trackingNo || !phone) continue;

        const internalStatus = mapStatus(rsStatus);

        // Update the order by matching customer_phone
        sqlStmts.push(
            `UPDATE orders SET tracking_no = '${trackingNo}', courier_status = '${rsStatus.replace(/'/g, "''")}', status = '${internalStatus}' WHERE customer_phone = '${phone}' AND tracking_no IS NULL;`
        );
        matchCount++;
    }

    if (sqlStmts.length === 0) {
        console.log("No valid records found to map.");
        process.exit(0);
    }

    const sqlFile = 'map_tracking.sql';
    fs.writeFileSync(sqlFile, sqlStmts.join('\n'));
    console.log(`Generated SQL to map tracking IDs for up to ${matchCount} records.`);

    // Execute
    console.log("Applying to Remote DB...");
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${sqlFile}`, { stdio: 'inherit' });

    console.log("Applying to Local DB...");
    execSync(`npx wrangler d1 execute ${DB_NAME} --local --file=${sqlFile}`, { stdio: 'inherit' });

    console.log("Mapping successfully completed!");
} catch (e) {
    console.error("Failed:", e.message);
}
