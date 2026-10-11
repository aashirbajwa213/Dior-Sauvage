-- ============================================================================
-- Gionee Pakistan - Return Reduction & Order Health System
-- Phase 1 Migration: Risk Scores, Customer Profiles & City Registry
-- ============================================================================

-- 1. Order Risk Scores Table
CREATE TABLE IF NOT EXISTS order_risk_scores (
    order_id TEXT PRIMARY KEY,
    health_score INTEGER NOT NULL DEFAULT 100,  -- 0 to 100 (100 = safest, 0 = critical risk)
    risk_level TEXT NOT NULL DEFAULT 'Low',     -- 'Low' (80-100), 'Medium' (60-79), 'High' (40-59), 'Critical' (0-39)
    
    -- Sub-scores
    address_score INTEGER DEFAULT 35,          -- Max 35
    customer_score INTEGER DEFAULT 35,         -- Max 35
    city_score INTEGER DEFAULT 20,             -- Max 20
    product_score INTEGER DEFAULT 10,          -- Max 10
    
    -- Inspection Details & Flags (Stored as JSON text arrays)
    address_flags TEXT DEFAULT '[]',
    customer_flags TEXT DEFAULT '[]',
    city_flags TEXT DEFAULT '[]',
    product_flags TEXT DEFAULT '[]',
    all_flags TEXT DEFAULT '[]',
    recommendations TEXT DEFAULT '[]',
    
    -- Fast Flags for Indexing / Filtering
    is_serial_returner INTEGER DEFAULT 0,
    is_high_risk_city INTEGER DEFAULT 0,
    is_landmark_only INTEGER DEFAULT 0,
    
    calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_risk_level ON order_risk_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_scores_health_score ON order_risk_scores(health_score);

-- 2. Customer Profiles (Aggregated Lifetime History per Phone Number)
CREATE TABLE IF NOT EXISTS customer_profiles (
    phone TEXT PRIMARY KEY,
    name TEXT,
    city TEXT,
    email TEXT,
    total_orders INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_returned INTEGER DEFAULT 0,
    total_cancelled INTEGER DEFAULT 0,
    total_in_transit INTEGER DEFAULT 0,
    return_rate REAL DEFAULT 0.0,
    lifetime_value REAL DEFAULT 0.0,
    
    -- Segmentation: 'VIP', 'Good', 'Neutral', 'Risky', 'Serial Returner', 'Blacklisted'
    risk_tier TEXT DEFAULT 'Neutral',
    blacklisted INTEGER DEFAULT 0,
    blacklist_reason TEXT,
    admin_notes TEXT,
    
    first_order_at TEXT,
    last_order_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_risk_tier ON customer_profiles(risk_tier);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_blacklisted ON customer_profiles(blacklisted);

-- 3. City Risk Registry (Aggregated City Performance)
CREATE TABLE IF NOT EXISTS city_risk_registry (
    city_normalized TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    total_orders INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_returned INTEGER DEFAULT 0,
    return_rate REAL DEFAULT 0.0,
    risk_level TEXT DEFAULT 'Low', -- 'Low', 'Medium', 'High', 'Critical'
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_city_risk_level ON city_risk_registry(risk_level);

-- 4. Extend orders table with Return Reason tracking (if not already existing)
-- SQLite requires individual ALTER TABLE statements
ALTER TABLE orders ADD COLUMN return_reason TEXT;
ALTER TABLE orders ADD COLUMN return_notes TEXT;
