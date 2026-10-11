import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs';

const IMAP_HOST = 'imap.hostinger.com';
const IMAP_PORT = 993;
const IMAP_USER = 'support@gionee.com.pk';
const IMAP_PASS = 'Abl24288??';

const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: {
        user: IMAP_USER,
        pass: IMAP_PASS
    },
    logger: false
});

async function main() {
    console.log('Connecting to IMAP server...');
    await client.connect();
    console.log('Connected!');

    let lock = await client.getMailboxLock('INBOX');
    try {
        console.log('Searching for order emails...');
        const messages = client.fetch({ subject: 'New Order: #' }, { source: true, envelope: true }, { uid: false });
        
        const extractedOrders = [];

        for await (let msg of messages) {
            const parsed = await simpleParser(msg.source);
            const text = parsed.text || '';
            const subject = parsed.subject || '';

            // Extract Order ID
            const idMatch = subject.match(/#([A-Z0-9]+)/);
            const legacy_id = idMatch ? idMatch[1] : `GPK_LEGACY_${Date.now()}`;
            
            // Extract Details
            const nameMatch = text.match(/Name:\s*(.+)/);
            const phoneMatch = text.match(/Phone:\s*(.+)/);
            const emailMatch = text.match(/Email:\s*(.+)/);
            const cityMatch = text.match(/City:\s*(.+)/);
            const addressMatch = text.match(/Address:\s*(.+)/);
            const deliveryFeeMatch = text.match(/Delivery Fee:\s*PKR\s*([0-9,]+)/);
            const totalMatch = text.match(/Total Amount:\s*PKR\s*([0-9,]+)/);

            if (!nameMatch || !phoneMatch || !addressMatch) {
                console.log(`Skipping ${legacy_id}, not a valid order format.`);
                continue;
            }

            // Clean Phone (strip non-digits)
            let phone = phoneMatch[1].replace(/\D/g, "");
            
            // Handle missing email
            let email = emailMatch ? emailMatch[1].trim() : "";
            if (email.toLowerCase() === 'n/a') email = "";

            const orderData = {
                id: legacy_id,
                created_at: parsed.date, // Original receive date
                customer_name: nameMatch[1].trim(),
                customer_phone: phone,
                customer_email: email,
                city: cityMatch ? cityMatch[1].trim() : 'Unknown',
                address: addressMatch[1].trim(),
                delivery_fee: deliveryFeeMatch ? parseInt(deliveryFeeMatch[1].replace(/,/g, ''), 10) : 200,
                total_amount: totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0,
                status: 'Delivered', // Assume older legacy orders are Delivered?
                items: []
            };

            // Extract Items
            const itemsBlockMatch = text.match(/Item Qty Price\n([\s\S]+?)\n\nDelivery Fee:/);
            if (itemsBlockMatch) {
                const itemsLines = itemsBlockMatch[1].trim().split('\n');
                for (let i = 0; i < itemsLines.length; i += 2) {
                    if (i + 1 >= itemsLines.length) break;
                    const productName = itemsLines[i].trim();
                    const qtyPriceMatch = itemsLines[i+1].match(/(\d+)\s+PKR\s+([0-9,]+)/);
                    if (qtyPriceMatch) {
                        const quantity = parseInt(qtyPriceMatch[1], 10);
                        const price = parseInt(qtyPriceMatch[2].replace(/,/g, ''), 10);
                        
                        // Let's resolve the product mapping
                        let productId = 1; // Default
                        if (productName.toLowerCase().includes('type-c')) productId = 2;
                        
                        let unitCount = 1;
                        let packLabel = 'Single';
                        const packMatch = productName.match(/Pack of (\d+)/i);
                        if (packMatch) {
                            unitCount = parseInt(packMatch[1], 10);
                            packLabel = `Pack of ${unitCount}`;
                        } else if (quantity > 1 && productName.toLowerCase().includes('pack')) {
                             // Fallback
                        }

                        orderData.items.push({
                            product_id: productId,
                            product_name: productId === 1 ? 'Gionee Handsfree 3.5mm' : 'Gionee Handsfree Type-C',
                            unit_price: price / (unitCount * quantity), // Approx
                            quantity: unitCount * quantity,
                            pack_size_label: packLabel
                        });
                    }
                }
            }

            extractedOrders.push(orderData);
        }

        fs.writeFileSync('legacy_orders.json', JSON.stringify(extractedOrders, null, 2));
        console.log(`\nSuccessfully extracted ${extractedOrders.length} orders to legacy_orders.json`);

    } catch (err) {
        console.error('Error fetching emails:', err);
    } finally {
        lock.release();
    }

    await client.logout();
}

main().catch(err => console.error(err));
