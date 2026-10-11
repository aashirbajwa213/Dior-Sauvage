/**
 * Authentication Utility for Gionee Pakistan Admin Dashboard
 * Uses native Web Crypto API (PBKDF2) — zero dependencies, runs on Cloudflare Edge.
 */

const SESSION_DURATION_DAYS = 7;
const DEFAULT_ADMINS = [
    { email: "altamashb02@gmail.com", password: "Abl24288??" },
    { email: "admin@gionee.com.pk", password: "Abl24288??" }
];

// ─── Database Setup ──────────────────────────────────────────────────────────

export async function ensureAuthTables(db: any): Promise<void> {
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `).run();
}

// ─── Password Hashing (PBKDF2 via Web Crypto) ────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        result[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return result;
}

export async function generateSalt(): Promise<string> {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    return bytesToHex(saltBytes);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );
    return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
    const hash = await hashPassword(password, salt);
    return hash === storedHash;
}

// ─── Admin Self-Provisioning ──────────────────────────────────────────────────

export async function ensureAdminProvisioned(db: any): Promise<void> {
    try {
        await ensureAuthTables(db);
        for (const admin of DEFAULT_ADMINS) {
            const normalizedEmail = admin.email.toLowerCase().trim();
            const existing = await db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").bind(normalizedEmail).first();
            if (!existing) {
                const salt = await generateSalt();
                const hash = await hashPassword(admin.password, salt);
                await db.prepare("INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)")
                    .bind(normalizedEmail, hash, salt).run();
                console.log("[Auth] Admin user provisioned:", normalizedEmail);
            }
        }
    } catch (e) {
        console.error("[Auth] Error provisioning admin:", e);
    }
}

// ─── Session Management ───────────────────────────────────────────────────────

export async function createSession(db: any, userId: number): Promise<string> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(sessionId, userId, expiresAt).run();
    return sessionId;
}

export async function validateSession(db: any, sessionId: string): Promise<{ userId: number; email: string } | null> {
    if (!sessionId) return null;
    try {
        const session: any = await db.prepare(`
            SELECT s.user_id, s.expires_at, u.email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ?
        `).bind(sessionId).first();

        if (!session) return null;
        if (new Date(session.expires_at) < new Date()) {
            // Expired — clean it up
            await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
            return null;
        }
        return { userId: session.user_id, email: session.email };
    } catch (e) {
        console.error("[Auth] Session validation error:", e);
        return null;
    }
}

export async function destroySession(db: any, sessionId: string): Promise<void> {
    try {
        await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    } catch (e) {
        console.error("[Auth] Session destroy error:", e);
    }
}

export async function loginUser(db: any, email: string, password: string): Promise<string | null> {
    try {
        await ensureAdminProvisioned(db);
        const user: any = await db.prepare("SELECT id, password_hash, salt FROM users WHERE email = ?")
            .bind(email.toLowerCase().trim()).first();
        if (!user) return null;
        const valid = await verifyPassword(password, user.password_hash, user.salt);
        if (!valid) return null;
        return await createSession(db, user.id);
    } catch (e) {
        console.error("[Auth] Login error:", e);
        return null;
    }
}
