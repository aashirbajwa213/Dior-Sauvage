import Database from 'better-sqlite3';
import fs from 'fs';

const path1 = 'D:\\AntiGravity Room\\Gionee May 2026\\.wrangler\\state\\v3\\d1\\miniflare-D1DatabaseObject\\08b8c02fa0457bf1b0bdb59ca3d4f707fbe5ee7f8842da34da67cdd0bb218df3.sqlite';
const path2 = 'D:\\AntiGravity Room\\Gionee May 2026\\.wrangler\\state\\v3\\d1\\miniflare-D1DatabaseObject\\2b35d4d42e3c9f6b5ad5b5579a7b1473216834b6e511417036cd81d772ecda74.sqlite';

try {
    const db1 = new Database(path1);
    const rows1 = db1.prepare('SELECT id, images FROM products LIMIT 5').all();
    console.log("DB1 Products:", rows1);
} catch (e) { console.log("DB1 failed:", e.message); }

try {
    const db2 = new Database(path2);
    const rows2 = db2.prepare('SELECT id, images FROM products LIMIT 5').all();
    console.log("DB2 Products:", rows2);
} catch (e) { console.log("DB2 failed:", e.message); }
