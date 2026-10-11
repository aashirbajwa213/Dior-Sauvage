import type { APIRoute } from 'astro';
import { getCachedCourierCities, getExcludedCourierCities, syncCourierCities, normalizeDestinationCity } from '../../../utils/courier';
import { getAllSettings } from '../../../utils/settings';

export const GET: APIRoute = async ({ request, locals }) => {
    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ success: false, error: 'Database binding missing' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(request.url);
        const query = (url.searchParams.get('q') || '').trim().toLowerCase();
        const checkCity = (url.searchParams.get('check') || '').trim();

        const cities = await getCachedCourierCities(db);
        const settings = await getAllSettings(db);

        if (checkCity) {
            const validation = normalizeDestinationCity(checkCity, cities);
            const excludedCities = await getExcludedCourierCities(db);
            const isExcluded = validation.isValid && excludedCities.some(e => e.toLowerCase() === (validation.normalizedCity || '').toLowerCase());
            return new Response(JSON.stringify({ success: true, ...validation, isExcluded }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let filteredCities = cities;
        if (query.length > 0) {
            filteredCities = cities.filter(c => c.toLowerCase().includes(query)).slice(0, 30);
        }

        return new Response(JSON.stringify({
            success: true,
            count: cities.length,
            cities: query ? filteredCities : cities,
            lastSynced: settings.courier_cities_last_synced || null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const POST: APIRoute = async ({ locals }) => {
    const db = locals.runtime?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ success: false, error: 'Database binding missing' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const syncResult = await syncCourierCities(db);
        return new Response(JSON.stringify(syncResult), {
            status: syncResult.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
