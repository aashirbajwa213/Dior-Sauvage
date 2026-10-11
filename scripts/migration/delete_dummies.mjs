import { execSync } from 'child_process';
import fs from 'fs';

const DB_NAME = "gionee-v2-test";

const query = "SELECT id, customer_name, customer_phone, status, total_amount, created_at FROM orders WHERE customer_name IN ('Ashir test', 'Just Enough', 'Ashir Manzoor', 'Gionee Pakistan', 'Mohsin Manzoor', 'Mohsin Saab', 'Aashir Bajwa', 'Afzaa Muteen', 'Mohsin', 'test', 'Test') OR customer_phone IN ('03360002392', '03011255753', '03027156388', '3360002392', '3011255753', '3027156388', '+923360002392', '+923011255753', '+923027156388', '923360002392', '923011255753', '923027156388') OR customer_phone LIKE '%620'";

try {
    // 1. Fetch matching records to show the user
    console.log("Fetching matching dummy orders from Live DB...");
    const selectCmd = `npx wrangler d1 execute ${DB_NAME} --remote --command="${query}" --json`;
    const output = execSync(selectCmd, { stdio: 'pipe' }).toString();
    
    // Parse the JSON output
    // Wrangler typically wraps the output in an array, and the results are inside it
    const parsedOutput = JSON.parse(output);
    const results = parsedOutput[0]?.results || [];
    
    console.log(`Found ${results.length} dummy orders.`);
    
    fs.writeFileSync('deleted_dummies.json', JSON.stringify(results, null, 2));

    // 2. Delete them
    if (results.length > 0) {
        const idsToDelete = results.map(r => `'${r.id}'`).join(',');
        const deleteQuery = `DELETE FROM orders WHERE id IN (${idsToDelete})`;
        
        console.log("Deleting from Live DB...");
        execSync(`npx wrangler d1 execute ${DB_NAME} --remote --command="${deleteQuery}"`, { stdio: 'inherit' });
        
        console.log("Deleting from Local DB just in case...");
        execSync(`npx wrangler d1 execute ${DB_NAME} --local --command="${deleteQuery}"`, { stdio: 'inherit' });
    }

    console.log("Done!");
} catch (e) {
    console.error("Error executing script:", e.message);
    if (e.stdout) console.log("STDOUT:", e.stdout.toString());
    if (e.stderr) console.error("STDERR:", e.stderr.toString());
}
