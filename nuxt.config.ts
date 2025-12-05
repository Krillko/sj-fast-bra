// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },

  runtimeConfig: {
    public: {
      environment: process.env.NUXT_PUBLIC_ENVIRONMENT ?? 'local',
    }
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
  }
});
