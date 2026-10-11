import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
    const db = context.locals.runtime?.env?.DB;
    if (!db) return new Response("No DB");
    
    const results: any = {};
    try {
        const prod = await db.prepare("SELECT COUNT(*) as count FROM products").first();
        results.products = prod?.count;
    } catch (e: any) { results.products_err = e.message; }

    try {
        const ord = await db.prepare("SELECT COUNT(*) as count FROM orders").first();
        results.orders = ord?.count;
    } catch (e: any) { results.orders_err = e.message; }

    try {
        const cust = await db.prepare("SELECT COUNT(*) as count FROM customer_profiles").first();
        results.customer_profiles = cust?.count;
    } catch (e: any) { results.customer_profiles_err = e.message; }

    try {
        const set = await db.prepare("SELECT COUNT(*) as count FROM settings").first();
        results.settings = set?.count;
    } catch (e: any) { results.settings_err = e.message; }

    return new Response(JSON.stringify(results, null, 2), {
        headers: { "Content-Type": "application/json" }
    });
};
