const fs = require('fs');
const path = require('path');

const RS_COURIER_BASE_URL = "https://portal.rscourier.pk/API";
const TARGET_DIR = path.join(__dirname, 'src', 'data');
const TARGET_FILE = path.join(TARGET_DIR, 'cities.json');

async function fetchAndSaveCities() {
    try {
        console.log(`Fetching cities...`);
        const res = await fetch(`${RS_COURIER_BASE_URL}/GetCitiesList.php`);
        const data = await res.json();
        
        if (data && data.data) {
            const cities = data.data.map(c => c.city_name.trim()).filter(Boolean);
            
            // Remove duplicates and sort alphabetically
            const uniqueCities = [...new Set(cities)].sort((a, b) => a.localeCompare(b));
            
            if (!fs.existsSync(TARGET_DIR)){
                fs.mkdirSync(TARGET_DIR, { recursive: true });
            }
            
            fs.writeFileSync(TARGET_FILE, JSON.stringify(uniqueCities, null, 2));
            console.log(`Successfully saved ${uniqueCities.length} unique cities to ${TARGET_FILE}`);
        } else {
            console.log("Failed to fetch cities properly: ", data);
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

fetchAndSaveCities();
