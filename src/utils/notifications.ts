import { addTimelineEntry } from "./timeline";

export async function sendShippedNotifications(db: any, env: any, shippedOrder: any, trackingNo: string, trackingUrl?: string): Promise<{ successMsg: string; errorMsg: string }> {
    let successMsg = "";
    let errorMsg = "";

    if (!shippedOrder) return { successMsg, errorMsg };

    const effectiveTrackingUrl = trackingUrl || `https://gionee.com.pk/track-order/${shippedOrder.id}/`;

    // 1. Send Dispatch Email (if applicable)
    if (shippedOrder.customer_email) {
        try {
            const { Resend } = await import("resend");
            const { getAllSettings } = await import("./settings");
            
            const resendApiKey = env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
            
            if (resendApiKey && resendApiKey !== "missing_key") {
                const resend = new Resend(resendApiKey);
                
                let settings: any = {};
                try {
                    settings = await getAllSettings(db);
                } catch (e) {
                    console.error("Failed to fetch settings for shipped email template", e);
                }

                if (settings.email_shipped_enabled === false) {
                    console.log(`[Email Dispatch] Skipped: email_shipped_enabled is turned off.`);
                } else {
                    const sender = settings.email_sender || "Gionee Pakistan <orders@gionee.com.pk>";
                    const subjectTpl = settings.email_subject_shipped || `Your Gionee Order #${shippedOrder.id} Has Been Shipped! 🚚`;
                    const subject = subjectTpl.replace(/{order_id}/g, shippedOrder.id.toString());
                
                let bodyTpl = settings.email_template_shipped;
                if (!bodyTpl) {
                    bodyTpl = `<div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
    <div style="background:#ff6b00;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:26px;">GIONEE</h1>
        <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">Original Handsfree — Pakistan</p>
    </div>
    <div style="padding:30px;">
        <h2 style="color:#111;margin-top:0;">Your Order Has Been Shipped! 📦</h2>
        <p style="color:#555;line-height:1.7;">Hi <strong>{customer_name}</strong>,</p>
        <p style="color:#555;line-height:1.7;">Great news! Your order <strong>#{order_id}</strong> has been packed and handed over to our shipping partner. It's on its way to you!</p>
        <div style="background:#f8f5ff;border:1px solid #e8e0ff;padding:20px;border-radius:8px;margin:24px 0;">
            <p style="margin:0 0 8px;font-size:12px;color:#6b46c1;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Tracking Number</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#5b21b6;letter-spacing:2px;">{tracking_no}</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
            <a href="{tracking_url}" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Track Your Order Live →</a>
        </div>
        <h3 style="color:#111;margin:32px 0 12px;font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;">Shipping Details</h3>
        <p style="color:#555;margin:4px 0;font-size:14px;"><strong>Courier Partner:</strong> {courier_name}</p>
        <p style="color:#555;margin:4px 0;font-size:14px;"><strong>Delivery Address:</strong><br/>{address}<br/>{city}</p>
    </div>
    <div style="background:#fafafa;padding:20px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#666;margin:0 0 8px;font-size:13px;">Need help with your shipment?</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 12px auto 0;">
            <tr>
                <td style="padding: 0 8px;">
                    <a href="https://wa.me/923112390620" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:8px 16px;border-radius:16px;font-weight:600;font-size:13px;">WhatsApp Support</a>
                </td>
                <td style="padding: 0 8px;">
                    <a href="mailto:support@gionee.com.pk" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:8px 16px;border-radius:16px;font-weight:600;font-size:13px;">Email Support</a>
                </td>
            </tr>
        </table>
    </div>
</div>`;
                }

                const whatsappNumber = settings.public_whatsapp_number || "923112390620";
                const emailHtml = bodyTpl
                    .replace(/{customer_name}/g, shippedOrder.customer_name)
                    .replace(/{order_id}/g, shippedOrder.id.toString())
                    .replace(/{tracking_no}/g, trackingNo)
                    .replace(/{tracking_url}/g, effectiveTrackingUrl)
                    .replace(/{courier_name}/g, shippedOrder.courier_name || "RS Courier")
                    .replace(/{address}/g, shippedOrder.address)
                    .replace(/{city}/g, shippedOrder.city)
                    .replace(/{year}/g, new Date().getFullYear().toString())
                    .replace(/923112390620/g, whatsappNumber);

                const payload = {
                    from: sender,
                    to: [shippedOrder.customer_email],
                    subject: subject,
                    html: emailHtml,
                };
                const resendResult = await resend.emails.send(payload);

                try {
                    await db.prepare(`
                        INSERT INTO resend_email_logs (type, order_id, recipient, subject, payload, response, error) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        "Order Shipped", `#${shippedOrder.id}`, shippedOrder.customer_email, subject, 
                        JSON.stringify(payload), 
                        resendResult.data ? JSON.stringify(resendResult.data) : null, 
                        resendResult.error ? JSON.stringify(resendResult.error) : null
                    ).run();
                } catch(e) { console.error("Failed to log email", e); }

                await addTimelineEntry(db, shippedOrder.id, "Shipped", "Dispatch Email Sent",
                    `Shipping confirmation email sent to ${shippedOrder.customer_email} with tracking link.`);
                successMsg += " Dispatch email sent to customer.";
                }
            }
        } catch (emailErr: any) {
            console.error("Failed to send shipped email:", emailErr);
            await addTimelineEntry(db, shippedOrder.id, "Shipped", "Dispatch Email Failed", `Failed to send email. Error: ${emailErr.message}`);
            errorMsg += " Failed to send email.";
        }
    }

    // 2. Send WhatsApp Shipped Notification
    if (shippedOrder.customer_phone) {
        try {
            const { sendOrderShippedWhatsApp } = await import("./whatsapp");
            const waResult = await sendOrderShippedWhatsApp(db, {
                id: shippedOrder.id,
                customer_name: shippedOrder.customer_name,
                customer_phone: shippedOrder.customer_phone,
                tracking_no: trackingNo,
                tracking_url: effectiveTrackingUrl
            });

            if (waResult.success) {
                await addTimelineEntry(db, shippedOrder.id, "Shipped", "WhatsApp Dispatch Alert Sent",
                    "Automated WhatsApp message sent to customer with tracking link.");
                successMsg += " WhatsApp dispatch alert sent.";
            } else {
                await addTimelineEntry(db, shippedOrder.id, "Shipped", "WhatsApp Dispatch Alert Failed", `Failed to send automated WhatsApp message. Error: ${waResult.error}`);
                errorMsg += ` Failed to send WhatsApp alert: ${waResult.error}`;
            }
        } catch (waErr: any) {
            console.error("Failed to send shipped WhatsApp message:", waErr);
            await addTimelineEntry(db, shippedOrder.id, "Shipped", "WhatsApp Dispatch Alert Failed", `Failed to send automated WhatsApp message. Error: ${waErr.message}`);
            errorMsg += " Failed to send WhatsApp alert.";
        }
    }

    return { successMsg, errorMsg };
}

/**
 * Sends an email notification to admins when WhatsApp service stops or disconnects.
 * Throttled to 1 email every 15 minutes to avoid flood.
 */
export async function sendWhatsAppFailureEmailAlert(
    db: any, 
    env: any, 
    errorDetail: string, 
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    if (!db) return { success: false, error: "Database unavailable" };

    try {
        const { getAllSettings, saveSetting } = await import("./settings");
        const settings = await getAllSettings(db);

        if (!settings.whatsapp_failure_alert_enabled) {
            return { success: false, error: "WhatsApp failure email alert is disabled in settings." };
        }

        // Check throttle/cooldown: 15 minutes minimum interval between alerts
        const lastAlertStr = settings.whatsapp_failure_last_alert_at;
        if (lastAlertStr) {
            const lastAlertTime = new Date(lastAlertStr).getTime();
            const now = Date.now();
            const cooldownMs = 15 * 60 * 1000; // 15 minutes
            if (!isNaN(lastAlertTime) && (now - lastAlertTime) < cooldownMs) {
                console.log(`[WA Failure Email] Cooldown active. Last alert sent at ${lastAlertStr}. Skipping duplicate alert.`);
                return { success: false, error: "Alert cooldown active" };
            }
        }

        const resendApiKey = env?.RESEND_API_KEY || import.meta.env?.RESEND_API_KEY;
        if (!resendApiKey || resendApiKey === "missing_key") {
            return { success: false, error: "Resend API key is not configured." };
        }

        const rawRecipients = settings.whatsapp_failure_alert_recipients || "support@gionee.com.pk, aashirblogging@gmail.com";
        const recipients = rawRecipients
            .split(/[,;\n]+/)
            .map(r => r.trim())
            .filter(r => r.includes("@"));

        if (recipients.length === 0) {
            return { success: false, error: "No valid email recipients configured." };
        }

        const { Resend } = await import("resend");
        const resend = new Resend(resendApiKey);

        const sender = settings.email_sender || "Gionee Pakistan <orders@gionee.com.pk>";
        const subject = settings.whatsapp_failure_alert_subject || "⚠️ Urgent: WhatsApp Gateway Disconnected / Needs Reconnection";
        const bodyTpl = settings.whatsapp_failure_alert_template;

        const currentTimestamp = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "full", timeStyle: "medium" });
        const adminUrl = "https://gionee.com.pk/admin/settings/whatsapp/?tab=connection";
        const storeUrl = "https://gionee.com.pk/";

        const emailHtml = bodyTpl
            .replace(/{error_message}/g, errorDetail || "Unknown connection error")
            .replace(/{session_id}/g, sessionId || "default")
            .replace(/{timestamp}/g, currentTimestamp)
            .replace(/{admin_url}/g, adminUrl)
            .replace(/{store_url}/g, storeUrl);

        const payload = {
            from: sender,
            to: recipients,
            subject: subject,
            html: emailHtml,
        };

        const resendResult = await resend.emails.send(payload);

        // Ensure log table exists and save log
        try {
            await db.prepare(`
                CREATE TABLE IF NOT EXISTS resend_email_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    order_id TEXT,
                    recipient TEXT NOT NULL,
                    subject TEXT,
                    payload TEXT,
                    response TEXT,
                    error TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run().catch(() => {});

            await db.prepare(`
                INSERT INTO resend_email_logs (type, order_id, recipient, subject, payload, response, error) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                "WhatsApp Alert", "SYSTEM", recipients.join(", "), subject, 
                JSON.stringify(payload), 
                resendResult.data ? JSON.stringify(resendResult.data) : null, 
                resendResult.error ? JSON.stringify(resendResult.error) : null
            ).run();
        } catch (logErr) {
            console.error("Failed to log failure alert email:", logErr);
        }

        // Update last alert timestamp
        await saveSetting(db, "whatsapp_failure_last_alert_at", new Date().toISOString());

        return { success: true };
    } catch (err: any) {
        console.error("Failed to send WhatsApp failure email alert:", err);
        return { success: false, error: err.message };
    }
}
