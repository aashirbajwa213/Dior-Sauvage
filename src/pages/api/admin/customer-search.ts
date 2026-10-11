import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    
    if (query.length < 2) {
        return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: 'Database not available' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const searchPattern = `%${query}%`;
        const { results } = await db.prepare(`
            SELECT 
                customer_phone as phone, 
                MAX(customer_name) as name, 
                MAX(customer_email) as email,
                MAX(city) as city, 
                MAX(address) as address 
            FROM orders 
            WHERE customer_phone LIKE ? OR customer_name LIKE ?
            GROUP BY customer_phone
            LIMIT 10
        `).bind(searchPattern, searchPattern).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
