import { defineMiddleware } from "astro:middleware";
import { validateSession, ensureAdminProvisioned } from "./utils/auth";

const PROTECTED_PREFIX = "/admin";
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/logout"];

export const onRequest = defineMiddleware(async (context, next) => {
    const { url, cookies, redirect, locals } = context;
    const pathname = url.pathname;

    // Only protect /admin/* routes
    if (!pathname.startsWith(PROTECTED_PREFIX)) {
        return next();
    }

    // Allow login and logout pages through without auth check
    const isPublicPath = PUBLIC_ADMIN_PATHS.some(p => pathname === p || pathname === p + "/");
    if (isPublicPath) {
        return next();
    }

    // Get the D1 database from Cloudflare runtime
    const db = (locals as any).runtime?.env?.DB;
    if (!db) {
        // No DB available — let the page handle it gracefully
        return next();
    }

    // Ensure admin user exists on every protected page hit (self-healing)
    await ensureAdminProvisioned(db);

    // Check session cookie
    const sessionId = cookies.get("gionee_admin_session")?.value;
    if (!sessionId) {
        return redirect("/admin/login");
    }

    const user = await validateSession(db, sessionId);
    if (!user) {
        // Invalid or expired session — clear cookie and redirect
        cookies.delete("gionee_admin_session", { path: "/" });
        return redirect("/admin/login");
    }

    // Attach user info to locals for use in pages
    (locals as any).adminUser = user;

    return next();
});
