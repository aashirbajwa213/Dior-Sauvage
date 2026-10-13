import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { Resend } from 'resend';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { AwsClient } from "aws4fetch";
import { addTimelineEntry } from '../utils/timeline';
import { getAllSettings } from '../utils/settings';

const ADMIN_EMAILS = ['aashirblogging@gmail.com', 'support@diorsauvage.pk']; // Final destinations

// Helper to get Resend instance
function getResend(context: any) {
    const apiKey = context.locals?.runtime?.env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;

    if (!apiKey || apiKey === 'missing_key') {
        throw new ActionError({
            code: 'UNAUTHORIZED',
            message: 'Resend API Key is missing in .env file (or Cloudflare Secrets). Please add it to send emails.',
        });
    }

    return new Resend(apiKey);
}

// Helper to verify Turnstile Token
async function verifyTurnstile(token: string, secretKey: string) {
    if (!secretKey || secretKey === 'missing_key') {
        // Skip verification if key is missing (dev mode or setup phase)
        console.warn('Turnstile Secret Key missing. Skipping verification.');
        return true;
    }

    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
    });

    const result = await check.json();
    if (!result.success) {
        throw new ActionError({
            code: 'FORBIDDEN',
            message: 'Captcha verification failed. Please refresh and try again.',
        });
    }
    return true;
}

export const server = {
    // Contact Form Action
    contact: defineAction({
        accept: 'form',
        input: z.object({
            name: z.string(),
            email: z.string().email(),
            subject: z.string(),
            message: z.string(),
            turnstileToken: z.string().optional(),
        }),
        handler: async (input, context) => {
            const resend = getResend(context);

            const { data, error } = await resend.emails.send({
                from: 'Dior Sauvage <contact@diorsauvage.pk>',
                to: ADMIN_EMAILS,
                replyTo: input.email,
                subject: `Contact Form: ${input.subject} - from ${input.name}`,
                html: `
          <h3>New Contact Form Submission</h3>
          <p><strong>Name:</strong> ${input.name}</p>
          <p><strong>Email:</strong> ${input.email}</p>
          <p><strong>Subject:</strong> ${input.subject}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 8px;">${input.message}</p>
        `,
            });

            if (error) {
                throw new ActionError({
                    code: 'BAD_REQUEST',
                    message: error.message,
                });
            }
            return data;
        },
    }),

    // Wholesale Form Action
    wholesale: defineAction({
        accept: 'form',
        input: z.object({
            businessName: z.string(),
            contactPerson: z.string(),
            whatsapp: z.string(),
            city: z.string(),
            capacity: z.string(),
            message: z.string().optional(),
            turnstileToken: z.string(),
        }),
        handler: async (input, context) => {
            const resend = getResend(context);
            const turnstileSecret = context.locals?.runtime?.env?.TURNSTILE_SECRET_KEY ||
                context.locals?.runtime?.env?.SECRET_KEY ||
                import.meta.env.TURNSTILE_SECRET_KEY ||
                import.meta.env.SECRET_KEY;

            await verifyTurnstile(input.turnstileToken, turnstileSecret);

            const { data, error } = await resend.emails.send({
                from: 'Gionee Wholesale <wholesale@gionee.com.pk>',
                to: ADMIN_EMAILS,
                subject: `Wholesale Inquiry: ${input.businessName} - ${input.city}`,
                html: `
          <h3>New Wholesale Dealer Application</h3>
          <p><strong>Business Name:</strong> ${input.businessName}</p>
          <p><strong>Contact Person:</strong> ${input.contactPerson}</p>
          <p><strong>WhatsApp:</strong> ${input.whatsapp}</p>
          <p><strong>City:</strong> ${input.city}</p>
          <p><strong>Monthly Capacity:</strong> ${input.capacity}</p>
          <p><strong>Message:</strong> ${input.message || 'No message'}</p>
        `,
            });

            if (error) {
                throw new ActionError({
                    code: 'BAD_REQUEST',
                    message: error.message,
                });
            }
            return data;
        },
    }),

    // Order Form Action
    order: defineAction({
        accept: 'json',
        input: z.object({
            customer: z.object({
                name: z.string(),
                phone: z.string(),
                email: z.string().optional(),
                city: z.string(),
                address: z.string(),
            }),
            items: z.array(z.object({
                id: z.string(),
                name: z.string(),
                price: z.number(),
                quantity: z.number(),
                packSize: z.number().optional(),
                productId: z.number().optional(),
                packId: z.number().optional(),
            })),
            total: z.number(),
            deliveryFee: z.number(),
            turnstileToken: z.string().optional(),
        }),
        handler: async (input, context) => {
            const resend = getResend(context);
            const turnstileSecret = context.locals?.runtime?.env?.TURNSTILE_SECRET_KEY ||
                context.locals?.runtime?.env?.SECRET_KEY ||
                import.meta.env.TURNSTILE_SECRET_KEY ||
                import.meta.env.SECRET_KEY;

            if (input.turnstileToken && input.turnstileToken !== 'disabled_on_checkout') {
                await verifyTurnstile(input.turnstileToken, turnstileSecret);
            }

            // Sanitize phone number (digits only)
            input.customer.phone = input.customer.phone.replace(/\D/g, "");

            // Generate order ID: GPK{Month}{3-digit sequence}
            const pakTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
            const currentMonth = String(pakTime.getMonth() + 1).padStart(2, '0');
            const orderPrefix = `GPK${currentMonth}`;
            
            const db = context.locals?.runtime?.env?.DB;
            let orderId = "";
            
            if (db) {
                try {
                    const latestOrder = await db.prepare("SELECT id FROM orders WHERE id LIKE ? ORDER BY CAST(SUBSTR(id, 6) AS INTEGER) DESC LIMIT 1").bind(`${orderPrefix}%`).first();
                    let sequence = 1;
                    if (latestOrder && latestOrder.id) {
                        const seqStr = String(latestOrder.id).substring(orderPrefix.length);
                        const seqInt = parseInt(seqStr, 10);
                        if (!isNaN(seqInt)) {
                            sequence = seqInt + 1;
                        }
                    }
                    orderId = `${orderPrefix}${String(sequence).padStart(3, '0')}`;
                } catch (e) {
                    console.error("Failed to generate sequential order ID:", e);
                    orderId = `${orderPrefix}${Math.random().toString(10).substring(2, 5)}`; // fallback
                }
            } else {
                orderId = `${orderPrefix}${Math.random().toString(10).substring(2, 5)}`; // fallback
            }
            // Recalculate totals on the server side using database records if available
            let validatedSubtotal = 0;
            let validatedTotalUnits = 0;
            let forceFreeShipping = false;
            const verifiedItems: any[] = [];

            if (db) {
                try {
                    for (const item of input.items) {
                        let productId = item.productId;
                        let packId = item.packId;

                        // 1. Resolve product ID from slug if not directly provided
                        if (!productId) {
                            const slug = item.id.split('-pack-')[0];
                            const productRow: any = await db.prepare(
                                `SELECT id, title FROM products WHERE slug = ?`
                            ).bind(slug).first();
                            if (productRow) {
                                productId = productRow.id;
                            } else {
                                // Single product store: Dior Sauvage 100ml
                                productId = 1;
                            }
                        }

                        // 2. Resolve package details
                        let dbPack: any = null;
                        if (packId) {
                            dbPack = await db.prepare(
                                `SELECT * FROM product_packs WHERE id = ? AND product_id = ?`
                            ).bind(packId, productId).first();
                        }

                        // Fallback: query by unit count if packId wasn't found or provided
                        if (!dbPack) {
                            const unitCount = item.packSize || 1;
                            dbPack = await db.prepare(
                                `SELECT * FROM product_packs WHERE product_id = ? AND unit_count = ?`
                            ).bind(productId, unitCount).first();
                        }

                        // 3. Resolve product row for title snapshot
                        const dbProduct: any = await db.prepare(
                            `SELECT title FROM products WHERE id = ?`
                        ).bind(productId).first();

                        const productTitle = dbProduct ? dbProduct.title : item.name.split(' - Pack of')[0];
                        const packLabel = dbPack ? dbPack.pack_label : (item.packSize && item.packSize > 1 ? `Pack of ${item.packSize}` : 'Single');
                        const unitCount = dbPack ? dbPack.unit_count : (item.packSize || 1);
                        const packPrice = dbPack ? dbPack.pack_price : item.price;
                        const unitPrice = packPrice / unitCount;

                        if (dbPack && dbPack.free_shipping === 1) {
                            forceFreeShipping = true;
                        }

                        validatedSubtotal += packPrice * item.quantity;
                        validatedTotalUnits += unitCount * item.quantity;

                        verifiedItems.push({
                            productId,
                            productName: productTitle,
                            unitPrice,
                            physicalQuantity: unitCount * item.quantity,
                            packSizeLabel: packLabel,
                            clientPrice: item.price,
                            clientName: item.name
                        });
                    }

                    // Fetch settings for dynamic delivery charges and free shipping threshold
                    let deliveryCharges = 200;
                    let freeShippingThreshold = 0;
                    try {
                        const settings = await getAllSettings(db);
                        deliveryCharges = settings.delivery_charges;
                        freeShippingThreshold = settings.free_shipping_threshold;
                    } catch (e) {
                        console.error("Failed to fetch settings for delivery calculation", e);
                    }

                    // Calculate correct delivery charges
                    let validatedDeliveryFee = deliveryCharges;
                    if (forceFreeShipping || (freeShippingThreshold > 0 && validatedSubtotal >= freeShippingThreshold)) {
                        validatedDeliveryFee = 0;
                    }
                    const validatedTotal = validatedSubtotal + validatedDeliveryFee;

                    // Save Order & Items to D1
                    await db.prepare(`
                        INSERT INTO orders (id, customer_name, customer_phone, customer_email, city, address, delivery_fee, total_amount, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        orderId,
                        input.customer.name,
                        input.customer.phone,
                        input.customer.email || null,
                        input.customer.city,
                        input.customer.address,
                        validatedDeliveryFee,
                        validatedTotal,
                        'Pending'
                    ).run();

                    for (const verifiedItem of verifiedItems) {
                        await db.prepare(`
                            INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, pack_size_label)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).bind(
                            orderId,
                            verifiedItem.productId,
                            verifiedItem.productName,
                            verifiedItem.unitPrice,
                            verifiedItem.physicalQuantity,
                            verifiedItem.packSizeLabel
                        ).run();
                    }

                    // Auto-calculate Order Health Score and sync Customer Profile immediately (Real-Time)
                    try {
                        const { syncOrderRiskAndCustomer } = await import('../utils/orderRiskSync');
                        await syncOrderRiskAndCustomer(db, orderId);
                    } catch (syncErr) {
                        console.error(`Failed to auto-sync risk & customer for order #${orderId}:`, syncErr);
                    }

                    // Insert Order Placed event to timeline
                    await addTimelineEntry(
                        db,
                        orderId,
                        'Pending',
                        'Order Placed',
                        'Your order has been received and is currently pending confirmation.'
                    );

                    // Auto-send WhatsApp confirmation request to customer immediately
                    try {
                        const { sendOrderConfirmationRequest } = await import('../utils/whatsapp');
                        
                        // Cloudflare Pages limits execution time; we must send immediately.
                        const sendWaTask = async () => {
                            try {
                                const waResult = await sendOrderConfirmationRequest(db, {
                                    id: orderId,
                                    customer_name: input.customer.name,
                                    customer_phone: input.customer.phone,
                                    total_amount: validatedTotal,
                                    city: input.customer.city
                                });
                                if (waResult.success) {
                                    await addTimelineEntry(db, orderId, 'Pending', 'WhatsApp Confirmation Sent',
                                        'Automated WhatsApp message sent to customer requesting order confirmation.');
                                } else {
                                    console.warn(`WhatsApp confirmation not sent for #${orderId}: ${waResult.error}`);
                                    await addTimelineEntry(db, orderId, 'Pending', 'WhatsApp Message Failed',
                                        `Failed to send automated WhatsApp message. Error: ${waResult.error}`);
                                }
                            } catch (e: any) {
                                console.error(`WhatsApp confirmation failed for #${orderId}:`, e);
                                await addTimelineEntry(db, orderId, 'Pending', 'WhatsApp Message Failed',
                                    `System error when trying to send WhatsApp message. Error: ${e.message}`);
                            }
                        };

                        if (context.locals?.runtime?.ctx?.waitUntil) {
                            context.locals.runtime.ctx.waitUntil(sendWaTask());
                        } else {
                            sendWaTask();
                        }
                    } catch (waError: any) {
                        console.warn(`WhatsApp auto-send setup failed for order #${orderId}:`, waError.message);
                    }

                    console.log(`Order #${orderId} securely saved to D1. Total Units: ${validatedTotalUnits}, Subtotal: PKR ${validatedSubtotal}, Total: PKR ${validatedTotal}`);
                } catch (dbError) {
                    console.error('Failed secure D1 order write:', dbError);
                }
            } else {
                console.warn('Cloudflare D1 missing during checkout action. Falling back to basic email notification.');
            }

            // Common Items HTML for both emails
            const itemsHtml = input.items.map(item => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <div style="font-weight: 500; color: #111;">${item.name}</div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">PKR ${item.price.toLocaleString()}</td>
        </tr>
      `).join('');

            const adminEmailPayload = {
                from: 'Dior Sauvage Orders <contact@diorsauvage.pk>',
                to: ADMIN_EMAILS,
                subject: `New Order: #${orderId} - ${input.customer.name}`,
                html: `
          <h3>New Order Confirmation - #${orderId}</h3>
          <h4>Customer Details</h4>
          <p><strong>Name:</strong> ${input.customer.name}</p>
          <p><strong>Phone:</strong> ${input.customer.phone}</p>
          <p><strong>Email:</strong> ${input.customer.email || 'N/A'}</p>
          <p><strong>City:</strong> ${input.customer.city}</p>
          <p><strong>Address:</strong> ${input.customer.address}</p>
          
          <h4>Order Items</h4>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background: #f8f8f8;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div style="margin-top: 20px; text-align: right;">
            <p><strong>Delivery Fee:</strong> PKR ${input.deliveryFee.toLocaleString()}</p>
            <p style="font-size: 1.25rem; color: #02274F;"><strong>Total Amount:</strong> PKR ${input.total.toLocaleString()}</p>
          </div>
        `,
            };

            let adminEmailResult: any = { data: null, error: null };
            try {
                adminEmailResult = await resend.emails.send(adminEmailPayload);

                if (db) {
                    try {
                        await db.prepare(`
                            INSERT INTO resend_email_logs (type, order_id, recipient, subject, payload, response, error) 
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            "Admin Alert", `#${orderId}`, ADMIN_EMAILS.join(", "), adminEmailPayload.subject, 
                            JSON.stringify(adminEmailPayload), 
                            adminEmailResult.data ? JSON.stringify(adminEmailResult.data) : null, 
                            adminEmailResult.error ? JSON.stringify(adminEmailResult.error) : null
                        ).run();
                    } catch(e) { console.error("Failed to log admin email", e); }
                }

                if (adminEmailResult.error) {
                    console.error("Admin order email warning:", adminEmailResult.error.message);
                }
            } catch (emailErr: any) {
                console.error("Non-fatal admin order notification error:", emailErr?.message);
            }

            // 2. Send Customer Email (if email exists and enabled)
            if (input.customer.email) {
                let settings: any = {};
                if (db) {
                    try {
                        settings = await getAllSettings(db);
                    } catch (e) {
                        console.error("Failed to fetch settings for email template", e);
                    }
                }

                if (settings.email_placed_enabled !== false) {
                    const sender = settings.email_sender || 'Dior Sauvage <orders@diorsauvage.pk>';
                    const subjectTpl = settings.email_subject_order_placed || `Order Received: #{order_id} - Dior Sauvage Pakistan`;
                    const subject = subjectTpl.replace(/{order_id}/g, orderId);

                    let bodyTpl = settings.email_template_order_placed;
                    if (!bodyTpl) {
                        // Fallback to old hardcoded HTML
                        bodyTpl = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                <!-- Header -->
                <div style="background: #02274F; padding: 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">DIOR SAUVAGE</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0; font-size: 14px;">Eau de Parfum 100ml — Pakistan</p>
                </div>

                <!-- Content -->
                <div style="padding: 30px;">
                    <h2 style="color: #111; margin-top: 0;">Thank You for Your Order!</h2>
                    <p style="color: #555; line-height: 1.6;">Hi <strong>{customer_name}</strong>,</p>
                    <p style="color: #555; line-height: 1.6;">We have received your order <strong>#{order_id}</strong>. We are getting it ready for you!</p>

                    <!-- Important Note -->
                    <div style="background: #f0f7ff; border-left: 4px solid #02274F; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="color: #02274F; font-weight: 500; margin: 0;">
                            ℹ️ Please expect an Order Confirmation call or WhatsApp message from our Team shortly.
                        </p>
                    </div>

                    <!-- Order Summary -->
                    <h3 style="color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 30px;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                         <thead>
                            <tr style="background: #f9f9f9; color: #666; font-size: 14px;">
                                <th style="padding: 10px; text-align: left;">Item</th>
                                <th style="padding: 10px; text-align: center;">Qty</th>
                                <th style="padding: 10px; text-align: right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_table}
                        </tbody>
                    </table>

                    <div style="margin-top: 20px; text-align: right; border-top: 2px solid #eee; padding-top: 15px;">
                        <p style="margin: 5px 0; color: #666;">Delivery Fee: PKR {shipping}</p>
                        <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #02274F;">Total: PKR {total}</p>
                    </div>

                     <!-- Shipping Address -->
                    <div style="margin-top: 30px; background: #fafafa; padding: 20px; border-radius: 8px;">
                        <h4 style="margin: 0 0 10px; color: #111;">Shipping Address</h4>
                        <p style="margin: 0; color: #666; line-height: 1.5;">
                            {address}<br>
                            {city}<br>
                            {phone}
                        </p>
                    </div>
                </div>

                <!-- Footer -->
                <div style="background: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="color: #666; margin: 0 0 10px;">Need help?</p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                        <tr>
                            <td style="padding: 0 10px;">
                                <a href="https://wa.me/923112390620" style="display: block; background: #25D366; color: white; text-decoration: none; padding: 8px 16px; border-radius: 20px; font-weight: 500; font-size: 14px; white-space: nowrap;">WhatsApp Us</a>
                            </td>
                            <td style="padding: 0 10px;">
                                <a href="mailto:support@diorsauvage.pk" style="display: block; background: #02274F; color: white; text-decoration: none; padding: 8px 16px; border-radius: 20px; font-weight: 500; font-size: 14px; white-space: nowrap;">Email Us</a>
                            </td>
                        </tr>
                    </table>

                    <p style="color: #999; font-size: 12px; margin-top: 20px;">
                        &copy; {year} <a href="https://diorsauvage.pk" style="color: #02274F; text-decoration: none;">Dior Sauvage Pakistan</a>. All rights reserved.
                    </p>
                </div>
            </div>
            `;
                    }

                    let whatsappNumber = "923112390620";
                    try {
                        const settings = await getAllSettings(db);
                        if (settings.public_whatsapp_number) whatsappNumber = settings.public_whatsapp_number;
                    } catch(e) {}

                    const emailHtml = bodyTpl
                        .replace(/{customer_name}/g, input.customer.name)
                        .replace(/{order_id}/g, orderId)
                        .replace(/{items_table}/g, itemsHtml)
                        .replace(/{subtotal}/g, validatedSubtotal.toLocaleString())
                        .replace(/{shipping}/g, input.deliveryFee.toLocaleString())
                        .replace(/{total}/g, input.total.toLocaleString())
                        .replace(/{address}/g, input.customer.address)
                        .replace(/{city}/g, input.customer.city)
                        .replace(/{phone}/g, input.customer.phone)
                        .replace(/{year}/g, new Date().getFullYear().toString())
                        .replace(/923112390620/g, whatsappNumber);

                    const customerPayload = {
                        from: 'Dior Sauvage <orders@diorsauvage.pk>',
                        to: [input.customer.email],
                        subject: subject,
                        html: emailHtml,
                    };
                    
                    try {
                        const customerEmailResult = await resend.emails.send(customerPayload);

                        if (db) {
                            try {
                                await db.prepare(`
                                    INSERT INTO resend_email_logs (type, order_id, recipient, subject, payload, response, error) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                `).bind(
                                    "Order Placed", `#${orderId}`, input.customer.email, subject, 
                                    JSON.stringify(customerPayload), 
                                    customerEmailResult.data ? JSON.stringify(customerEmailResult.data) : null, 
                                    customerEmailResult.error ? JSON.stringify(customerEmailResult.error) : null
                                ).run();
                            } catch(e) { console.error("Failed to log customer email", e); }
                        }
                    } catch (customerEmailErr: any) {
                        console.error("Non-fatal customer confirmation email error:", customerEmailErr?.message);
                    }
                }
            }

            return { orderId, success: true };
        },
    }),

    // Submit Customer Review Action
    submitReview: defineAction({
        accept: 'form',
        input: z.object({
            productId: z.coerce.number(),
            rating: z.coerce.number().min(1).max(5),
            title: z.string(),
            text: z.string(),
            author: z.string(),
            location: z.string().optional(),
        }),
        handler: async (input, context) => {
            const db = context.locals?.runtime?.env?.DB;
            if (db) {
                try {
                    await db.prepare(`
                        INSERT INTO reviews (product_id, rating, title, text, author, location)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(
                        input.productId,
                        input.rating,
                        input.title,
                        input.text,
                        input.author,
                        input.location || null
                    ).run();
                    console.log(`Dynamic review added successfully for product ID ${input.productId}`);
                    return { success: true };
                } catch (e: any) {
                    console.error('Failed to write review to D1:', e);
                    throw new ActionError({
                        code: 'BAD_REQUEST',
                        message: 'Database error: ' + e.message,
                    });
                }
            } else {
                throw new ActionError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Cloudflare D1 Database not available.',
                });
            }
        },
    }),

    // Upload Image to Cloudflare R2
    uploadImage: defineAction({
        accept: 'form',
        input: z.object({
            file: z.instanceof(File),
        }),
        handler: async (input, context) => {
            const accessKeyId = context.locals.runtime?.env?.VITE_R2_ACCESS_KEY_ID || import.meta.env.VITE_R2_ACCESS_KEY_ID || '73d40fefffbf4b1ebfcbcd5b921218a9';
            const secretAccessKey = context.locals.runtime?.env?.VITE_R2_SECRET_ACCESS_KEY || import.meta.env.VITE_R2_SECRET_ACCESS_KEY || '4ff2aa1991b3a11d5ab319549e47c87280630b724dc1912af58d2ed3c974fcc3';
            const endpoint = context.locals.runtime?.env?.VITE_R2_ENDPOINT || import.meta.env.VITE_R2_ENDPOINT || 'https://258780d0baed98f3ae02166d94442ed4.r2.cloudflarestorage.com';
            const bucket = context.locals.runtime?.env?.VITE_R2_BUCKET || import.meta.env.VITE_R2_BUCKET || 'gionee-media';
            let publicUrl = context.locals.runtime?.env?.VITE_R2_PUBLIC_URL || import.meta.env.VITE_R2_PUBLIC_URL || 'https://cdn.gionee.com.pk';
            if (publicUrl && !publicUrl.startsWith('http')) {
                publicUrl = 'https://' + publicUrl;
            }

            if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
                throw new ActionError({
                    code: 'BAD_REQUEST',
                    message: 'Cloudflare R2 configuration credentials are missing in your environment.',
                });
            }

            try {
                const s3 = new S3Client({
                    region: 'auto',
                    endpoint: endpoint,
                    credentials: {
                        accessKeyId: accessKeyId,
                        secretAccessKey: secretAccessKey,
                    },
                });

                const file = input.file;
                const buffer = new Uint8Array(await file.arrayBuffer());
                
                // Get clean file extension
                const extension = file.name.split('.').pop() || 'jpg';
                const fileName = `uploads/media/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;

                await s3.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: fileName,
                    Body: buffer,
                    ContentType: file.type,
                }));

                const finalUrl = `${publicUrl.replace(/\/$/, '')}/${fileName}`;
                return { url: finalUrl };
            } catch (e: any) {
                console.error('R2 Image Upload Action Error:', e);
                throw new ActionError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'R2 S3 Upload Failed: ' + e.message,
                });
            }
        }
    }),

    // List Images from Cloudflare R2
    listImages: defineAction({
        handler: async (_, context) => {
            const accessKeyId = context.locals.runtime?.env?.VITE_R2_ACCESS_KEY_ID || import.meta.env.VITE_R2_ACCESS_KEY_ID || '73d40fefffbf4b1ebfcbcd5b921218a9';
            const secretAccessKey = context.locals.runtime?.env?.VITE_R2_SECRET_ACCESS_KEY || import.meta.env.VITE_R2_SECRET_ACCESS_KEY || '4ff2aa1991b3a11d5ab319549e47c87280630b724dc1912af58d2ed3c974fcc3';
            const endpoint = context.locals.runtime?.env?.VITE_R2_ENDPOINT || import.meta.env.VITE_R2_ENDPOINT || 'https://258780d0baed98f3ae02166d94442ed4.r2.cloudflarestorage.com';
            const bucket = context.locals.runtime?.env?.VITE_R2_BUCKET || import.meta.env.VITE_R2_BUCKET || 'gionee-media';
            let publicUrl = context.locals.runtime?.env?.VITE_R2_PUBLIC_URL || import.meta.env.VITE_R2_PUBLIC_URL || 'https://cdn.gionee.com.pk';
            if (publicUrl && !publicUrl.startsWith('http')) {
                publicUrl = 'https://' + publicUrl;
            }

            if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
                throw new ActionError({
                    code: 'BAD_REQUEST',
                    message: 'Cloudflare R2 configuration credentials are missing in your environment.',
                });
            }

            try {
                const aws = new AwsClient({
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey,
                    service: 's3',
                    region: 'auto',
                });

                const url = new URL(`${endpoint}/${bucket}?prefix=uploads/media/`);
                const response = await aws.fetch(url, { method: 'GET' });
                
                if (!response.ok) {
                    throw new Error(`S3 Error: ${response.status} ${await response.text()}`);
                }

                const xml = await response.text();
                
                // Parse XML with Regex to avoid DOMParser polyfill issues in Cloudflare Workers
                const contentsRegex = /<Contents>[\s\S]*?<\/Contents>/g;
                const keyRegex = /<Key>([^<]+)<\/Key>/;
                const dateRegex = /<LastModified>([^<]+)<\/LastModified>/;
                
                let matches;
                const objects: { Key: string, LastModified: number }[] = [];
                
                while ((matches = contentsRegex.exec(xml)) !== null) {
                    const contentBlock = matches[0];
                    const keyMatch = contentBlock.match(keyRegex);
                    const dateMatch = contentBlock.match(dateRegex);
                    
                    if (keyMatch && keyMatch[1]) {
                        objects.push({
                            Key: keyMatch[1],
                            LastModified: dateMatch && dateMatch[1] ? new Date(dateMatch[1]).getTime() : 0
                        });
                    }
                }

                const baseUrl = publicUrl.replace(/\/$/, '');
                
                // Map the objects to full URLs, sort by LastModified descending
                const images = objects
                    .sort((a, b) => b.LastModified - a.LastModified)
                    .map(obj => `${baseUrl}/${obj.Key}`)
                    .filter(url => url.match(/\.(jpg|jpeg|png|webp|gif)$/i));

                return { images };
            } catch (e: any) {
                console.error('R2 List Images Action Error:', e);
                throw new ActionError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to list images from R2: ' + e.message,
                });
            }
        }
    }),

    // Update Customer details across all their past orders
    updateCustomer: defineAction({
        accept: 'json',
        input: z.object({
            oldPhone: z.string(),
            newPhone: z.string(),
            name: z.string(),
            city: z.string(),
            address: z.string(),
            email: z.string().optional()
        }),
        handler: async (input, context) => {
            const db = context.locals.runtime?.env?.DB;
            if (!db) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

            try {
                await db.prepare(`
                    UPDATE orders 
                    SET customer_phone = ?, customer_name = ?, customer_email = ?, city = ?, address = ?
                    WHERE customer_phone = ?
                `).bind(input.newPhone, input.name, input.email || '', input.city, input.address, input.oldPhone).run();
                return { success: true };
            } catch (error: any) {
                console.error("Error updating customer:", error);
                throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update customer details: ' + error.message });
            }
        }
    })
};
