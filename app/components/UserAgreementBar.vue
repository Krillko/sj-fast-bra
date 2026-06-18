<script setup lang="ts">
// Joke sticky bar — not a real (or EU-compliant) consent banner.
// A cookie remembers the dismissal so it only nags once. Both buttons do the same thing.
const agreed = useCookie<boolean>('user-agreement-dismissed', {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  default: () => false,
});

const dismiss = () => {
  agreed.value = true;
};
</script>

<template>
  <div
    v-if="!agreed"
    class="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-default bg-elevated px-3 py-1 text-xs"
  >
    <span class="text-muted">
      If you work for SJ, Banverket or any subcontractor, you have to read and agree with
      <a
        href="/user-agreeeeeeemeeent.md"
        target="_blank"
        rel="noopener"
        class="underline hover:text-default"
      >this document</a>.
    </span>
    <span class="flex gap-2">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        label="No, I'm fine thanks"
        @click="dismiss"
      />
      <UButton
        size="xs"
        color="primary"
        variant="solid"
        label="Yes of course I agree with this shit"
        @click="dismiss"
      />
    </span>
  </div>
</template>
