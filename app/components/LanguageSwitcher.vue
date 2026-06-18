<script setup lang="ts">
const { locale, setLocale } = useI18n();

// Two languages → a simple toggle. The label shows the language you'll switch *to*.
const toggle = () => setLocale(locale.value === 'sv' ? 'en' : 'sv');
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
