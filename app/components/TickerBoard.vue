<script setup lang="ts">
import { TICKERS, computeTickerAmount } from '~/utils/tickers';

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// Whole SEK, no decimals, Swedish thousands grouping (e.g. "519 000").
const formatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

const tickers = computed(() => TICKERS.map((ticker) => ({
  id: ticker.id,
  prefix: ticker.prefix,
  suffix: ticker.suffix,
  amount: formatter.format(Math.round(computeTickerAmount(ticker, now.value))),
})));
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
        Visste du att...
      </h3>
    </template>

    <ul class="space-y-4">
      <li
        v-for="ticker in tickers"
        :key="ticker.id"
        class="flex gap-3 text-sm text-gray-700 dark:text-gray-300"
      >
        <UIcon name="i-heroicons-banknotes" class="mt-0.5 size-5 shrink-0 text-primary-500" />
        <p>
          {{ ticker.prefix }}
          <span class="font-bold tabular-nums text-gray-900 dark:text-white">{{ ticker.amount }} kr</span>
          <template v-if="ticker.suffix"> {{ ticker.suffix }}</template>
        </p>
      </li>
    </ul>
  </UCard>
</template>
