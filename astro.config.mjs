import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  server: {
    host: true,
    port: 4321
  },
  site: 'https://sauvagedior.pk/',
  trailingSlash: 'always',
  output: 'server',
  image: {
    domains: ["media.sauvagedior.pk", "cdn.sauvagedior.pk"],
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/.wrangler/**']
      }
    }
  },
  build: {
    inlineStylesheets: 'always'
  },

  integrations: [
    sitemap({
      filter: (page) =>
        page !== 'https://sauvagedior.pk/checkout/' &&
        page !== 'https://sauvagedior.pk/order-success/' &&
        !page.includes('/api/') &&
        !page.includes('/admin/'),
    })
  ]
});