<script setup lang="ts">
const { locale, setLocale } = useI18n();

// Persisted so an explicit choice survives reloads and overrides the per-domain
// default applied by the locale-by-domain middleware.
const preferred = useCookie<'sv' | 'en'>('preferred-locale', {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: '/',
});

// Two languages → a simple toggle. The label shows the language you'll switch *to*.
const toggle = () => {
  const next = locale.value === 'sv' ? 'en' : 'sv';
  preferred.value = next;
  setLocale(next);
};
</script>

<template>
  <UButton
    icon="i-heroicons-language"
    :label="locale === 'sv' ? 'EN' : 'SV'"
    color="gray"
    variant="ghost"
    :aria-label="locale === 'sv' ? 'Switch to English' : 'Byt till svenska'"
    @click="toggle"
  />
</template>
