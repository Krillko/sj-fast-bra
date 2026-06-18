// Default the UI locale from the domain the visitor arrived through:
//   *.butgoodinstead.com → English, everything else (fastbra.se, localhost) → Swedish.
// An explicit choice from the language switcher (stored in `preferred-locale`)
// always wins, so users can override the per-domain default and have it stick.
export default defineNuxtRouteMiddleware(() => {
  const nuxtApp = useNuxtApp();
  const { $i18n } = nuxtApp;

  const preferred = useCookie<'sv' | 'en'>('preferred-locale');
  const domainDefault = useRequestURL().hostname.includes('butgoodinstead') ? 'en' : 'sv';
  const target = preferred.value ?? domainDefault;

  if ($i18n.locale.value !== target) {
    return nuxtApp.runWithContext(() => $i18n.setLocale(target));
  }
});
