-- Drop tables if they exist to start fresh and avoid foreign key conflict during migration
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS product_packs;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;

-- 1. Create products table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    base_price REAL NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0,
    original_price REAL,
    description TEXT NOT NULL,
    long_description TEXT,
    badge TEXT,
    meta_title TEXT NOT NULL,
    meta_description TEXT NOT NULL,
    images TEXT NOT NULL,       -- JSON string array of R2 URLs: ["https://media.gionee.com.pk/img.jpg", ...]
    specs TEXT NOT NULL,        -- JSON array of key-value objects: [{"label": "Connector", "value": "USB-C"}]
    features TEXT NOT NULL,     -- JSON array of feature objects: [{"title": "Bass", "description": "Punchy bass"}]
    compatibility TEXT NOT NULL, -- JSON string array: ["Samsung S23", "iPhone 15", ...]
    faqs TEXT NOT NULL,         -- JSON array of FAQ objects: [{"question": "Q?", "answer": "A"}]
    review_count INTEGER DEFAULT 1000,
    rating REAL DEFAULT 4.8,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create product_packs table
CREATE TABLE IF NOT EXISTS product_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    pack_label TEXT NOT NULL,   -- e.g. "Pack of 3", "Single", "Pack of 5"
    unit_count INTEGER NOT NULL, -- e.g. 3, 1, 5
    pack_price REAL NOT NULL,    -- Custom pricing, e.g. 1500 (instead of 1650)
    free_shipping INTEGER NOT NULL DEFAULT 0, -- 0 = False, 1 = True (Free shipping toggle)
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- 3. Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    delivery_fee REAL NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    tracking_no TEXT,
    courier_status TEXT,
    courier_provider TEXT,
    courier_order_id TEXT,
    whatsapp_chat_id TEXT,
    shipped_at TEXT,
    delivered_at TEXT,
    updated_at TEXT,
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    return_status TEXT NOT NULL DEFAULT 'Pending',
    tracking_notes TEXT DEFAULT '',
    order_summary TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    pack_size_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
);

-- 5. Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    rating REAL NOT NULL,
    title TEXT,
    text TEXT NOT NULL,
    author TEXT NOT NULL,
    location TEXT,
    is_visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- 6. Create monthly_expenses table for BI ad spend tracking
CREATE TABLE IF NOT EXISTS monthly_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT UNIQUE NOT NULL, -- e.g., '2026-05'
    ad_spend REAL NOT NULL DEFAULT 0,
    other_expenses REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
