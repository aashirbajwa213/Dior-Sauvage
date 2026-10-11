-- 1. Alter orders table to add courier and automation columns
ALTER TABLE orders ADD COLUMN tracking_no TEXT;
ALTER TABLE orders ADD COLUMN courier_order_id TEXT;
ALTER TABLE orders ADD COLUMN courier_status TEXT;
ALTER TABLE orders ADD COLUMN whatsapp_confirmed INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipped_at TEXT;
ALTER TABLE orders ADD COLUMN delivered_at TEXT;

-- 2. Create settings table for dynamic admin control
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create order_timeline table for beautiful tracking timeline
CREATE TABLE IF NOT EXISTS order_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

-- 4. Seed default configuration values into settings table
INSERT OR REPLACE INTO settings (key, value, description) VALUES
('whatsapp_enabled', '0', 'Enable or disable automated WhatsApp messages (0 = Disabled, 1 = Enabled)'),
('whatsapp_api_url', 'http://localhost:3000', 'The API Base URL of your self-hosted OpenWA instance'),
('whatsapp_api_key', 'your-api-key', 'Authentication X-API-Key for OpenWA API requests'),
('whatsapp_session_id', 'gionee-session', 'WhatsApp session ID for OpenWA connection'),
('whatsapp_template_confirmation', 'Hi {customer_name}, thank you for placing your order at Gionee Pakistan! Your order #{order_id} totaling PKR {total_amount} (COD) has been received. Reply YES to confirm your order.', 'WhatsApp confirmation message sent when order is placed. Placeholders: {customer_name}, {order_id}, {total_amount}'),
('whatsapp_template_thank_you', 'Thank you! Your order #{order_id} is confirmed. We are preparing it for shipment and will email your tracking link once dispatched.', 'WhatsApp thank you message sent when customer replies YES. Placeholders: {customer_name}, {order_id}'),
('courier_enabled', '0', 'Enable or disable RS Courier API integration (0 = Disabled, 1 = Enabled)'),
('courier_client_code', 'your-client-code', 'Your RS Courier Client Code'),
('courier_auth_key', 'your-auth-key', 'Your RS Courier Auth Key'),
('courier_profile_id', 'your-profile-id', 'Your RS Courier Profile ID (from Products & Services API)'),
('courier_origin_city', 'your-origin-city', 'City from which you ship parcels (e.g. Lahore)'),
('courier_service_type', 'Parcel', 'RS Courier Service Type (e.g., Parcel, Documents, Overnight)'),
('courier_product_type', 'COD', 'RS Courier Product Type (e.g., COD, Prepaid)'),
('email_sender', 'Gionee Pakistan <orders@gionee.com.pk>', 'Sender email address and name (configured in Resend)'),
('email_subject_shipped', 'Your Gionee Order #{order_id} Has Been Shipped!', 'Email subject line for dispatch notifications. Placeholders: {order_id}'),
('email_template_shipped', '<h2>🚚 Order Dispatched!</h2><p>Hi {customer_name},</p><p>Great news! Your order <strong>#{order_id}</strong> has been shipped via RS Courier.</p><p><strong>Tracking Number:</strong> {tracking_no}</p><p>You can track your order''s live status timeline on our website using the link below:</p><p><a href="{tracking_link}" style="display:inline-block;padding:10px 20px;background:#E11D48;color:white;text-decoration:none;border-radius:5px;font-weight:bold;" target="_blank">Track Your Order Live</a></p><p>If the button doesn''t work, copy and paste this link in your browser:</p><p><a href="{tracking_link}" target="_blank">{tracking_link}</a></p><p>Thank you for choosing Gionee Pakistan!</p>', 'HTML email body sent when order is marked Shipped. Placeholders: {customer_name}, {order_id}, {tracking_no}, {tracking_link}');
