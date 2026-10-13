/**
 * Settings Helper Module for Gionee Pakistan Automation
 * Accesses the `settings` table in Cloudflare D1
 */

export interface SystemSettings {
    whatsapp_enabled: boolean;
    whatsapp_api_url: string;
    whatsapp_api_key: string;
    whatsapp_session_id: string;
    whatsapp_template_confirmation: string;
    whatsapp_confirmation_enabled: boolean;
    whatsapp_template_thank_you: string;
    whatsapp_thank_you_enabled: boolean;
    whatsapp_template_shipped: string;
    whatsapp_shipped_enabled: boolean;
    whatsapp_return_alert_enabled: boolean;
    whatsapp_return_alert_phone: string;
    whatsapp_template_returned: string;
    courier_enabled: boolean;
    courier_client_code: string;
    courier_auth_key: string;
    courier_profile_id: string;
    courier_origin_city: string;
    courier_service_type: string;
    courier_product_type: string;
    courier_default_weight: string;
    courier_api_vendor: string;
    courier_special_instructions: string;
    courier_default_provider?: string;
    courier_service_postex?: string;
    courier_service_leopards?: string;
    courier_service_trax?: string;
    courier_service_mnp?: string;
    courier_service_dastaq?: string;
    courier_service_auto?: string;
    courier_cached_cities?: string;
    courier_excluded_cities?: string;
    courier_cities_last_synced?: string;
    email_sender: string;
    email_subject_order_placed: string;
    email_template_order_placed: string;
    email_placed_enabled: boolean;
    email_subject_shipped: string;
    email_template_shipped: string;
    email_shipped_enabled: boolean;
    whatsapp_failure_alert_enabled: boolean;
    whatsapp_failure_alert_recipients: string;
    whatsapp_failure_alert_subject: string;
    whatsapp_failure_alert_template: string;
    whatsapp_failure_last_alert_at?: string;
    delivery_charges: number;
    free_shipping_threshold: number;
    public_whatsapp_number: string;
    bi_logistics_cost: number;
    current_monthly_ad_spend: number;
    announcement_bar_enabled: string;
    announcement_bar_text: string;
    smart_sticky_header_enabled: string;
    order_id_prefix: string;
}

// In-Memory Settings Cache (60s TTL) to cut D1 row reads by 99%
let _cachedSettings: SystemSettings | null = null;
let _cacheExpiry = 0;
const SETTINGS_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let _indexesEnsured = false;

export function invalidateSettingsCache(): void {
    _cachedSettings = null;
    _cacheExpiry = 0;
}

/**
 * Ensures critical database indexes exist to prevent expensive full-table scans.
 */
export async function ensureDatabaseIndexes(db: any): Promise<void> {
    if (!db || _indexesEnsured) return;
    try {
        const indexStatements = [
            "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);",
            "CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (customer_phone);",
            "CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);",
            "CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders (tracking_no);",
            "CREATE INDEX IF NOT EXISTS idx_orders_courier_status ON orders (courier_status);",
            "CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);",
            "CREATE INDEX IF NOT EXISTS idx_order_timeline_order_id ON order_timeline (order_id);",
            "CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);",
            "CREATE INDEX IF NOT EXISTS idx_chatbot_conv_session ON chatbot_conversations (session_id);",
            "CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conv ON chatbot_messages (conversation_id);",
            "CREATE INDEX IF NOT EXISTS idx_faqs_category_active ON faqs (category, is_active);",
            "CREATE INDEX IF NOT EXISTS idx_knowledge_urls_status ON knowledge_urls (status);"
        ];

        for (const sql of indexStatements) {
            await db.prepare(sql).run().catch(() => {});
        }
        _indexesEnsured = true;
    } catch (e) {
        console.warn("[DB] Non-critical index initialization notice:", e);
    }
}

/**
 * Fetch all settings from the database and map them to a strongly-typed object.
 * Uses 60-second in-memory cache to stay well within Cloudflare D1 free limits.
 */
export async function getAllSettings(db: any, forceFresh: boolean = false): Promise<SystemSettings> {
    if (!forceFresh && _cachedSettings && Date.now() < _cacheExpiry) {
        return _cachedSettings;
    }

    if (!db) {
        throw new Error("D1 Database connection is missing in settings utility.");
    }

    // Lazily ensure database indexes in background
    if (!_indexesEnsured) {
        ensureDatabaseIndexes(db).catch(() => {});
    }

    try {
        const { results } = await db.prepare("SELECT key, value FROM settings").all();
        
        // Map settings rows to key-value pairs
        const settingsMap: Record<string, string> = {};
        for (const row of results || []) {
            settingsMap[row.key] = row.value;
        }

        const oldConfirmationMigration = "Hi {customer_name}, thank you for placing your order at Gionee Pakistan! Your order #{order_id} totaling PKR {total_amount} (COD) has been received. Reply YES to confirm your order.";
        const defaultConfirmation = "*🤖 Automated Order Confirmation*\n\n" +
            "Hi *{customer_name}*,\n\n" +
            "Thank you for placing your order at *Gionee Pakistan*!\n\n" +
            "Here is your order summary:\n" +
            "*Order#:* #{order_id}\n" +
            "*Items*:\n{items}\n" +
            "*Amount (COD):* PKR *{total_amount}*\n" +
            "*Address:* {address}, {city}\n\n" +
            "👉 Please reply *YES* to confirm your order so we can dispatch it.\n\n" +
            "_Auto-message: Leave a message if you have queries; our representative will reply shortly._";

        let confirmationTemplate = settingsMap['whatsapp_template_confirmation'] || '';
        if (!confirmationTemplate || confirmationTemplate.trim() === oldConfirmationMigration) {
            confirmationTemplate = defaultConfirmation;
        }

        const oldThankYouMigration = "Thank you! Your order #{order_id} is confirmed. We are preparing it for shipment and will email your tracking link once dispatched.";
        const defaultThankYou = "Thank you *{customer_name}* for shopping with us!\n\n" +
            "Your order *#{order_id}* is confirmed. We are packing it now and will send your tracking link once dispatched.\n\n" +
            "_Auto-message: Leave a message if you have queries; our representative will reply shortly._";
        
        let thankYouTemplate = settingsMap['whatsapp_template_thank_you'] || '';
        if (!thankYouTemplate || thankYouTemplate.trim() === oldThankYouMigration) {
            thankYouTemplate = defaultThankYou;
        }

        const defaultShipped = "*📦 Your Order Has Been Shipped!*\n\n" +
            "Hi *{customer_name}*,\n\n" +
            "Great news! Your Gionee order *#{order_id}* has been dispatched.\n\n" +
            "*Tracking Number:* {tracking_no}\n" +
            "*Track Here:* {tracking_url}\n\n" +
            "_Auto-message: Leave a message if you have queries; our representative will reply shortly._";
        
        let shippedTemplate = settingsMap['whatsapp_template_shipped'] || '';
        if (!shippedTemplate) {
            shippedTemplate = defaultShipped;
        }

        const defaultReturned = "*⚠️ Return Alert: {count} Order(s) Returned*\n\n" +
            "{orders_list}\n\n" +
            "_Status updated to Returned in system._";

        let returnedTemplate = settingsMap['whatsapp_template_returned'] || '';
        if (!returnedTemplate) {
            returnedTemplate = defaultReturned;
        }

        const defaultEmailPlaced = `
<div style="max-w:600px;margin:0 auto;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;border:1px solid #eaeaec;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
    <div style="background:#ff6b00;padding:32px 24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Order Received!</h1>
    </div>
    <div style="padding:40px 32px;">
        <p style="font-size:16px;color:#333;line-height:1.6;margin:0 0 24px;">Hi <strong>{customer_name}</strong>,</p>
        <p style="font-size:16px;color:#444;line-height:1.6;margin:0 0 32px;">Thank you for shopping with Gionee Pakistan. We have received your order <strong>#{order_id}</strong>.</p>
        
        <div style="background:#f8f9fa;border-radius:8px;padding:24px;margin-bottom:32px;">
            <h2 style="font-size:14px;text-transform:uppercase;color:#888;letter-spacing:1px;margin:0 0 16px;font-weight:700;">Order Summary</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr>
                        <th style="text-align:left;padding:0 0 12px;border-bottom:2px solid #eee;color:#111;">Item</th>
                        <th style="text-align:center;padding:0 0 12px;border-bottom:2px solid #eee;color:#111;">Qty</th>
                        <th style="text-align:right;padding:0 0 12px;border-bottom:2px solid #eee;color:#111;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {items_table}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align:right;padding:16px 12px 12px;color:#666;">Subtotal:</td>
                        <td style="text-align:right;padding:16px 0 12px;font-weight:600;color:#111;">PKR {subtotal}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="text-align:right;padding:12px;color:#666;">Shipping:</td>
                        <td style="text-align:right;padding:12px 0;font-weight:600;color:#111;">{shipping}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="text-align:right;padding:16px 12px 0;border-top:2px solid #eee;color:#111;font-weight:700;">Total (COD):</td>
                        <td style="text-align:right;padding:16px 0 0;border-top:2px solid #eee;color:#ff6b00;font-weight:800;font-size:18px;">PKR {total}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <p style="font-size:14px;color:#666;line-height:1.6;margin:0;text-align:center;">You will receive an email with tracking details once your order is shipped.</p>
    </div>
    <div style="background:#f8f8f8;padding:24px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;margin:0;">&copy; {year} Gionee Pakistan. All rights reserved.</p>
    </div>
</div>`;

        const defaultEmailShipped = `
<div style="max-w:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;border:1px solid #eaeaec;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
    <div style="background:#ff6b00;padding:32px 24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Your Order is on the way!</h1>
    </div>
    <div style="padding:40px 32px;">
        <p style="font-size:16px;color:#333;line-height:1.6;margin:0 0 24px;">Hi <strong>{customer_name}</strong>,</p>
        <p style="font-size:16px;color:#444;line-height:1.6;margin:0 0 24px;">Great news! Your order <strong>#{order_id}</strong> has been shipped via <strong>{courier_name}</strong>.</p>
        
        <div style="background:#f8f9fa;border-radius:8px;padding:24px;margin:bottom:32px;">
            <p style="font-size:13px;text-transform:uppercase;color:#888;letter-spacing:1px;margin:0 0 8px;font-weight:700;">Tracking Number</p>
            <div style="font-size:24px;font-weight:800;color:#111;letter-spacing:1px;">{tracking_no}</div>
        </div>
        
        <div style="text-align:center;margin:28px 0;">
            <a href="{tracking_url}" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Track Your Order Live &rarr;</a>
        </div>
        
        <div style="background:#fafafa;padding:18px;border-radius:8px;margin-top:20px;">
            <h4 style="margin:0 0 8px;color:#111;">Delivery Details</h4>
            <p style="margin:0;color:#666;line-height:1.6;font-size:14px;">{address}<br><strong>{city}</strong></p>
        </div>
    </div>
    <div style="background:#f8f8f8;padding:20px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;margin:0;">&copy; {year} <a href="https://gionee.com.pk" style="color:#ff6b00;text-decoration:none;">Gionee Pakistan</a>. All rights reserved.</p>
    </div>
</div>`;

        const defaultEmailWhatsAppFailure = `<div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #fee2e2;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <div style="background:#dc2626;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:0.5px;">⚠️ WhatsApp Automation Alert</h1>
        <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">Gionee Pakistan System Notification</p>
    </div>
    <div style="padding:28px 24px;">
        <h2 style="color:#111;margin-top:0;font-size:18px;">WhatsApp Service Interrupted</h2>
        <p style="color:#4b5563;line-height:1.6;font-size:14px;">The automated WhatsApp service encountered a failure while attempting to send an outbound message. The WhatsApp session appears to be disconnected or stopped in the OpenWA gateway.</p>
        
        <div style="background:#fef2f2;border:1px solid #fecaca;padding:16px;border-radius:8px;margin:20px 0;">
            <p style="margin:0 0 6px;font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Error Details</p>
            <p style="margin:0;font-size:13px;font-family:monospace;color:#7f1d1d;word-break:break-word;">{error_message}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
            <tr>
                <td style="padding:8px 0;color:#6b7280;width:130px;font-weight:600;">Session Identifier:</td>
                <td style="padding:8px 0;color:#111827;font-family:monospace;">{session_id}</td>
            </tr>
            <tr>
                <td style="padding:8px 0;color:#6b7280;font-weight:600;">Time Detected:</td>
                <td style="padding:8px 0;color:#111827;">{timestamp}</td>
            </tr>
        </table>

        <div style="text-align:center;margin:28px 0 12px;">
            <a href="{admin_url}" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;box-shadow:0 2px 4px rgba(255,107,0,0.2);">Open WhatsApp Settings →</a>
        </div>
        <p style="color:#6b7280;font-size:12px;text-align:center;margin:8px 0 0;">Please check your OpenWA dashboard to reconnect/start the session.</p>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #f3f4f6;">
        <p style="color:#9ca3af;margin:0;font-size:12px;">Gionee Pakistan Automated Server Diagnostics</p>
    </div>
</div>`;

        const finalSettings: SystemSettings = {
            whatsapp_enabled: settingsMap['whatsapp_enabled'] === '1',
            whatsapp_api_url: settingsMap['whatsapp_api_url'] || 'http://localhost:3000',
            whatsapp_api_key: settingsMap['whatsapp_api_key'] || '',
            whatsapp_session_id: settingsMap['whatsapp_session_id'] || 'gionee-session',
            whatsapp_template_confirmation: confirmationTemplate,
            whatsapp_confirmation_enabled: settingsMap['whatsapp_confirmation_enabled'] !== '0',
            whatsapp_template_thank_you: thankYouTemplate,
            whatsapp_thank_you_enabled: settingsMap['whatsapp_thank_you_enabled'] !== '0',
            whatsapp_template_shipped: shippedTemplate,
            whatsapp_shipped_enabled: settingsMap['whatsapp_shipped_enabled'] !== '0',
            whatsapp_return_alert_enabled: settingsMap['whatsapp_return_alert_enabled'] !== '0',
            whatsapp_return_alert_phone: settingsMap['whatsapp_return_alert_phone'] || settingsMap['public_whatsapp_number'] || '923112390620',
            whatsapp_template_returned: returnedTemplate,
            courier_enabled: settingsMap['courier_enabled'] === '1',
            courier_client_code: settingsMap['courier_client_code'] || '',
            courier_auth_key: settingsMap['courier_auth_key'] || '',
            courier_profile_id: settingsMap['courier_profile_id'] || '',
            courier_origin_city: settingsMap['courier_origin_city'] || '',
            courier_service_type: settingsMap['courier_service_type'] || 'Overnight',
            courier_product_type: settingsMap['courier_product_type'] || 'COD',
            courier_default_weight: settingsMap['courier_default_weight'] || '0.5',
            courier_api_vendor: settingsMap['courier_api_vendor'] || 'auto',
            courier_special_instructions: settingsMap['courier_special_instructions'] || '',
            courier_default_provider: settingsMap['courier_default_provider'] || 'postex',
            courier_service_postex: settingsMap['courier_service_postex'] || 'Overnight',
            courier_service_leopards: settingsMap['courier_service_leopards'] || 'Detain',
            courier_service_trax: settingsMap['courier_service_trax'] || 'Overnight',
            courier_service_mnp: settingsMap['courier_service_mnp'] || 'Overnight',
            courier_service_dastaq: settingsMap['courier_service_dastaq'] || 'Overnight',
            courier_service_auto: settingsMap['courier_service_auto'] || 'Overnight',
            courier_cached_cities: settingsMap['courier_cached_cities'] || '',
            courier_excluded_cities: settingsMap['courier_excluded_cities'] || '[]',
            courier_cities_last_synced: settingsMap['courier_cities_last_synced'] || '',
            email_sender: settingsMap['email_sender'] || 'Gionee Pakistan <orders@gionee.com.pk>',
            email_subject_order_placed: settingsMap['email_subject_order_placed'] || 'Your Gionee Order #{order_id} is Received!',
            email_template_order_placed: settingsMap['email_template_order_placed'] || defaultEmailPlaced,
            email_placed_enabled: settingsMap['email_placed_enabled'] !== '0',
            email_subject_shipped: settingsMap['email_subject_shipped'] || 'Your Gionee Order #{order_id} Has Been Shipped!',
            email_template_shipped: settingsMap['email_template_shipped'] || defaultEmailShipped,
            email_shipped_enabled: settingsMap['email_shipped_enabled'] !== '0',
            whatsapp_failure_alert_enabled: settingsMap['whatsapp_failure_alert_enabled'] !== '0',
            whatsapp_failure_alert_recipients: settingsMap['whatsapp_failure_alert_recipients'] || 'support@gionee.com.pk, aashirblogging@gmail.com',
            whatsapp_failure_alert_subject: settingsMap['whatsapp_failure_alert_subject'] || '⚠️ Urgent: WhatsApp Gateway Disconnected / Needs Reconnection',
            whatsapp_failure_alert_template: settingsMap['whatsapp_failure_alert_template'] || defaultEmailWhatsAppFailure,
            whatsapp_failure_last_alert_at: settingsMap['whatsapp_failure_last_alert_at'] || '',
            delivery_charges: parseInt(settingsMap['delivery_charges'] || '200', 10),
            free_shipping_threshold: parseInt(settingsMap['free_shipping_threshold'] || '2000', 10),
            public_whatsapp_number: settingsMap['public_whatsapp_number'] || '923112390620',
            bi_logistics_cost: parseInt(settingsMap['bi_logistics_cost'] || '260', 10),
            current_monthly_ad_spend: parseInt(settingsMap['current_monthly_ad_spend'] || '0', 10),
            announcement_bar_enabled: settingsMap['announcement_bar_enabled'] || '0',
            announcement_bar_text: settingsMap['announcement_bar_text'] || 'Orders after 5:00 PM, 25 May 2026 will be shipped after Eid holidays. Thank you!',
            smart_sticky_header_enabled: settingsMap['smart_sticky_header_enabled'] || '1',
            order_id_prefix: (settingsMap['order_id_prefix'] || 'GPK').trim().toUpperCase()
        };

        // Cache in memory
        _cachedSettings = finalSettings;
        _cacheExpiry = Date.now() + SETTINGS_CACHE_TTL_MS;

        return finalSettings;
    } catch (e: any) {
        console.error("Failed to fetch settings from D1 database:", e.message);
        throw e;
    }
}

/**
 * Fetch a single setting value from D1
 */
export async function getSettingValue(db: any, key: string, defaultValue: string = ""): Promise<string> {
    if (!db) return defaultValue;
    try {
        const row: any = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
        return row ? row.value : defaultValue;
    } catch (e) {
        console.error(`Failed to get setting key ${key}:`, e);
        return defaultValue;
    }
}

/**
 * Save a single setting key-value pair to D1
 */
export async function saveSetting(db: any, key: string, value: string): Promise<boolean> {
    if (!db) return false;
    try {
        await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
            .bind(key, value)
            .run();
        invalidateSettingsCache();
        return true;
    } catch (e) {
        console.error(`Failed to save setting key ${key}:`, e);
        return false;
    }
}

/**
 * Batch save multiple settings at once
 */
export async function saveMultipleSettings(db: any, settings: Record<string, string>): Promise<boolean> {
    if (!db) return false;
    try {
        // Execute batch updates
        const statements = Object.entries(settings).map(([key, value]) => {
            return db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
                .bind(key, value);
        });
        
        await db.batch(statements);
        invalidateSettingsCache();
        return true;
    } catch (e) {
        console.error("Failed to batch save settings:", e);
        return false;
    }
}
