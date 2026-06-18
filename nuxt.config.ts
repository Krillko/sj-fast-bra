// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },

  runtimeConfig: {
    // Server-side only config for the SJ booking API client (server/utils/sjApi.ts)
    sj: {
      apiHost: 'https://prod-api.adp.sj.se',
      // Public subscription key embedded in SJ's own frontend bundle (Azure APIM
      // client identifier, not a user credential). Overridable via env; the client
      // also auto-extracts a fresh key from sj.se if this one ever returns 401.
      subscriptionKey: process.env.SJ_SUBSCRIPTION_KEY ?? 'd6625619def348d38be070027fd24ff6',
      clientName: 'sjse-booking-client',
      clientVersion: process.env.SJ_CLIENT_VERSION ?? '20260609.0039-prod',
      // Max concurrent offer requests when fetching prices per departure
      offersConcurrency: 5,
      // Split-ticket finder (hidden feature — see SPLIT.local.md). Bounded to stay
      // polite to SJ and under Cloudflare's per-request subrequest limit.
      splitConcurrency: 3,
      splitMaxCandidates: 40,
    },
    public: {
      environment: process.env.NUXT_PUBLIC_ENVIRONMENT ?? 'local',
    },
  },

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n'],

  css: ['~/assets/css/main.css'],

  i18n: {
    defaultLocale: 'sv',
    langDir: 'locales',
    locales: [
      {
        code: 'sv',
        language: 'sv-SE',
        name: 'Svenska',
        file: 'sv.json',
      },
    ],
  },

  colorMode: {
    preference: 'system',
  },
  devServer: {
    https: {
      key: './localhost-key.pem',
      cert: './localhost.pem',
    },
  },
  nitro: {
    compressPublicAssets: true,
    storage: {
      cache: {
        // Use filesystem for local development, Cloudflare KV for stage/production
        driver: process.env.NUXT_PUBLIC_ENVIRONMENT === 'local' ? 'fs' : 'cloudflare-kv-binding',
        ...(process.env.NUXT_PUBLIC_ENVIRONMENT === 'local' ? {
          base: './.cache', // Local filesystem cache directory
        } : {
          binding: 'CACHE', // KV namespace binding name
        }),
      },
    },
  },
});
