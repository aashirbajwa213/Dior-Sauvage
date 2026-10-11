import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
    const trackingNos = [
        'SA7535276790', // Delivered
        'SA7535342361', // Delivered
        'SA7535340372', // Returned
        'SA7525910467', // Returned
        'SA7539398637', // Booked/Shipped
        'SA7539398577', // Booked/Shipped
    ];

    const results = [];

    for (const t of trackingNos) {
        try {
            const response = await fetch('https://portal.rscourier.pk/API/TrackOrder.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_no: t })
            });
            const text = await response.text();
            let data = null;
            try { data = JSON.parse(text); } catch (e) { data = "Raw: " + text.substring(0, 50); }
            
            results.push({ tracking_no: t, response: data });
        } catch (e: any) {
            results.push({ tracking_no: t, error: e.message });
        }
    }

    return new Response(JSON.stringify({ results }, null, 2), {
        headers: { "Content-Type": "application/json" }
    });
};
