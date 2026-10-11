const fetch = require('node-fetch');
async function run() {
    try {
        const res = await fetch('https://www.leopardscourier.com', { headers: {'User-Agent': 'Mozilla/5.0'} });
        const text = await res.text();
        const match = text.match(/<form[^>]*action=\"([^\"]+)\"[\s\S]*?name=\"track_numbers\"/i);
        if (match) {
            console.log("Form action:", match[1]);
        } else {
            console.log("No tracking form found. Searching for action=...");
            const actions = text.match(/action=\"([^\"]+)\"/g);
            console.log(actions);
        }
    } catch(e) { console.error(e); }
}
run();
