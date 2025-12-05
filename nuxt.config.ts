// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4,
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
});
