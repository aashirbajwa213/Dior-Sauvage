const RS_COURIER_BASE_URL = "https://portal.rscourier.pk/API";

async function testEndpoints() {
    try {
        console.log(`Testing /GetCitiesList.php...`);
        const res = await fetch(`${RS_COURIER_BASE_URL}/GetCitiesList.php`);
        const data = await res.json();
        console.log(`Status: ${res.status}`);
        if (data && data.data) {
            console.log(`Found ${data.data.length} cities`);
            console.log(`First 5 cities:`, data.data.slice(0, 5));
        } else {
            console.log(data);
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

testEndpoints();
