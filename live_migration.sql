-- 1. Add cost_price to products
ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0;

-- 2. Create settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create monthly_expenses table
CREATE TABLE IF NOT EXISTS monthly_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT UNIQUE NOT NULL,
    ad_spend REAL NOT NULL DEFAULT 0,
    other_expenses REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Seed default settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES 
('whatsapp_enabled', '0', 'Enable or disable automated WhatsApp messages'),
('whatsapp_api_url', 'http://localhost:3000', 'The API Base URL'),
('whatsapp_api_key', 'your-api-key', 'Authentication X-API-Key'),
('whatsapp_session_id', 'gionee-session', 'WhatsApp session ID'),
('courier_enabled', '0', 'Enable or disable RS Courier API integration'),
('bi_logistics_cost', '260', 'BI Estimated Logistics Cost');
