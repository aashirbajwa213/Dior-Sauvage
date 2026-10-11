-- ==========================================================
-- Gionee Pakistan - Safe Delta Migration for Remote D1
-- Ensures all tables, columns, and default settings exist 
-- WITHOUT deleting or overwriting any existing live data.
-- ==========================================================

-- 1. AI Chatbot Tables
CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    customer_name TEXT,
    customer_phone TEXT,
    handover_reason TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_call_id TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'general',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Logs Tables
CREATE TABLE IF NOT EXISTS rs_courier_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    order_id TEXT,
    tracking_no TEXT,
    payload TEXT,
    response TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sender TEXT,
    message TEXT,
    payload TEXT,
    status TEXT,
    response TEXT
);

CREATE TABLE IF NOT EXISTS resend_email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_type TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    resend_id TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seed Default System & Chatbot Settings (Non-Destructive INSERT OR IGNORE)
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('chatbot_enabled', '1', 'Enable or disable storefront AI chatbot'),
('chatbot_title', 'Gionee Support Assistant', 'Title displayed on chat widget header'),
('chatbot_welcome_message', 'Hello! Welcome to Gionee Pakistan. How can I help you today?', 'Initial welcome message in chat widget'),
('chatbot_llm_provider', 'openrouter', 'Active LLM Provider (openrouter, gemini, groq, openai, custom)'),
('chatbot_model', 'google/gemma-2-9b-it:free', 'Model ID for AI chatbot'),
('chatbot_temperature', '0.3', 'Sampling temperature for AI responses'),
('chatbot_max_tokens', '600', 'Maximum token limit per response'),
('chatbot_system_prompt', 'You are the official AI Support Assistant for Gionee Pakistan.', 'System instructions for AI Assistant'),
('chatbot_fallback_message', 'I am having trouble connecting right now. Please click Speak with Human below to chat on WhatsApp or visit our Contact page.', 'Fallback message when AI connection fails'),
('chatbot_tool_search_products', '1', 'Allow chatbot to search store catalog'),
('chatbot_tool_order_lookup', '1', 'Allow chatbot to lookup order status with customer verification'),
('chatbot_tool_courier_tracking', '1', 'Allow chatbot to fetch live courier tracking status'),
('chatbot_tool_return_request', '0', 'Return requests handled by real human support'),
('chatbot_handover_whatsapp', '923390050385', 'WhatsApp support number for human handover'),
('chatbot_handover_whatsapp_prefill', 'Hello Gionee Support, I need assistance with my order/query from the store.', 'Pre-filled WhatsApp message for support chat'),
('chatbot_handover_contact_url', '/contact/', 'URL to the official store contact page'),
('chatbot_rate_limit_per_hour', '30', 'Maximum messages per session/IP per hour'),
('chatbot_retention_days', '30', 'Days to retain chat conversations'),
('courier_default_provider', 'postex', 'Default courier provider profile (postex, leopards, trax, mnp, dastaq, auto)'),
('whatsapp_return_alert_enabled', '1', 'Enable automated WhatsApp return alerts to admin'),
('whatsapp_return_alert_phone', '923112390620', 'Admin WhatsApp number to receive return escalation alerts'),
('whatsapp_template_returned', '*⚠️ Return Alert: {count} Order(s) Marked as Returned*\n\n{orders_list}\n\n_Status updated to Returned in system._', 'WhatsApp template for return alert notifications');
