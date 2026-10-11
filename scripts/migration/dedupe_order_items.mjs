import { execSync } from 'child_process';
import fs from 'fs';

const DB_NAME = "gionee-v2-test";

const sqlStmts = `
DELETE FROM order_items
WHERE id NOT IN (
    SELECT MIN(id)
    FROM order_items
    GROUP BY order_id, product_name
);
`;

const sqlFile = 'dedupe_items.sql';
fs.writeFileSync(sqlFile, sqlStmts);

console.log("Deduplicating Remote DB...");
execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${sqlFile}`, { stdio: 'inherit' });

console.log("Deduplicating Local DB...");
execSync(`npx wrangler d1 execute ${DB_NAME} --local --file=${sqlFile}`, { stdio: 'inherit' });

console.log("Deduplication complete!");
