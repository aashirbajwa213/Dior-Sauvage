import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
    const db = context.locals.runtime?.env?.DB;
    if (!db) return new Response("No DB");
    const { results } = await db.prepare("SELECT id, title, images FROM products LIMIT 5").all();
    return new Response(JSON.stringify(results, null, 2));
};
