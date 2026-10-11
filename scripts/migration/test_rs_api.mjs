// Using native fetch

const RS_COURIER_BASE_URL = "https://portal.rscourier.pk/API";
const AUTH_KEY = "829e7ae7-01cd-4cb0-a219-2f0306b9465d";
const CLIENT_CODE = "1298";

async function testEndpoints() {
    const endpoints = [
        "GetOrders.php",
        "GetAllOrders.php",
        "GetBookings.php",
        "ListOrders.php",
        "BookingHistory.php"
    ];

    for (const ep of endpoints) {
        console.log(`Testing ${ep}...`);
        try {
            // Test POST
            let res = await fetch(`${RS_COURIER_BASE_URL}/${ep}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_key: AUTH_KEY, client_code: CLIENT_CODE })
            });
            let text = await res.text();
            if (res.ok && !text.includes("<html") && !text.includes("404")) {
                console.log(`SUCCESS [POST] ${ep}: ${text.substring(0, 100)}...`);
            } else {
                // Test GET
                res = await fetch(`${RS_COURIER_BASE_URL}/${ep}?auth_key=${AUTH_KEY}&client_code=${CLIENT_CODE}`);
                text = await res.text();
                if (res.ok && !text.includes("<html") && !text.includes("404")) {
                    console.log(`SUCCESS [GET] ${ep}: ${text.substring(0, 100)}...`);
                } else {
                    console.log(`Failed ${ep}`);
                }
            }
        } catch (e) {
            console.log(`Error on ${ep}:`, e.message);
        }
    }
}

testEndpoints();
