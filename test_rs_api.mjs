const trackingNos = [
  'SA7535276790', // Delivered
  'SA7535342361', // Delivered
  'SA7535340372', // Returned
  'SA7525910467', // Returned
  'SA7539398637', // Booked/Shipped
  'SA7539398577', // Booked/Shipped
];

async function test() {
  for (const t of trackingNos) {
    console.log(`Checking Tracking No: ${t}`);
    try {
      const response = await fetch('https://portal.rscourier.pk/API/TrackOrder.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_no: t })
      });
      const text = await response.text();
      try {
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > 0) {
            console.log(`  Status: ${data[0].status}`);
            console.log(`  Created: ${data[0].created}`);
          } else {
            console.log(`  No data returned: ${JSON.stringify(data)}`);
          }
      } catch (e) {
          console.log(`  Not JSON! Raw text length: ${text.length}`);
          console.log(`  Preview: ${text.substring(0, 150)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
    console.log('---------------------------------');
  }
}

test();
