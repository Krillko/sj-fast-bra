<script setup lang="ts">
import { TICKERS, computeTickerAmount } from '~/utils/tickers';

const { t } = useI18n();

// Seed from a server-shared timestamp so the SSR render and the first client
// render compute the same amount (no hydration mismatch). The interval only
// starts ticking after mount, i.e. after hydration has completed.
const now = useState('tickerNow', () => Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  now.value = Date.now();
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
  prefix: t(ticker.prefixKey),
  suffix: ticker.suffixKey ? t(ticker.suffixKey) : undefined,
  amount: formatter.format(Math.round(computeTickerAmount(ticker, now.value))),
})));
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
        {{ t('tickers.title') }}
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
          <span class="whitespace-nowrap font-bold tabular-nums text-gray-900 dark:text-white">{{ ticker.amount }} kr</span>
          <template v-if="ticker.suffix">{{ ' ' + ticker.suffix }}</template>
        </p>
      </li>
    </ul>
  </UCard>
</template>
