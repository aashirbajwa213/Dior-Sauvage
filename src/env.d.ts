/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
    interface Locals extends Runtime {
        runtime: {
            env: {
                RESEND_API_KEY: string;
                TURNSTILE_SECRET_KEY: string;
                PUBLIC_TURNSTILE_SITE_KEY: string;
                SECRET_KEY: string;
                SITE_KEY: string;
                DB: import("@cloudflare/workers-types").D1Database;
            };
        };
        adminUser?: {
            userId: number;
            email: string;
        };
    }
}

interface ImportMetaEnv {
    readonly RESEND_API_KEY: string;
    readonly TURNSTILE_SECRET_KEY: string;
    readonly PUBLIC_TURNSTILE_SITE_KEY: string;
    readonly SECRET_KEY: string;
    readonly SITE_KEY: string;
}


interface ImportMeta {
    readonly env: ImportMetaEnv;
}

