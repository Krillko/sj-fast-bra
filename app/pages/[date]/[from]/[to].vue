<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white dark:bg-gray-800 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex justify-between items-center">
          <NuxtLink to="/" class="flex-1 max-w-3xl">
            <div class="bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center" style="aspect-ratio: 5/1;">
              <img
src="/logo/Sena-Jamt.svg"
class="w-full dark:invert"
alt="Sena Jämt">
            </div>
          </NuxtLink>
          <UButton
            :icon="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
            color="gray"
            variant="ghost"
            aria-label="Toggle theme"
            @click="toggleTheme"
          />
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <!-- Date in Past Error -->
      <div v-if="isDateInPast" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-calendar-days" class="w-16 h-16 text-red-500 mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Datum i det förflutna
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          Det går inte att söka efter tåg för datum som redan har passerat.
        </p>
        <UButton to="/">
          Tillbaka till sökning
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-else-if="status === 'pending'" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 animate-spin text-primary mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {{ t('results.loading') }}
        </h2>

        <!-- Status message (only show when no total yet) -->
        <p v-if="statusMessage && scrapeProgress.total === 0" class="text-sm text-gray-500 dark:text-gray-400 mb-2">
          {{ statusMessage }}
        </p>

        <p v-if="scrapeProgress.total === 0 && !statusMessage" class="text-gray-600 dark:text-gray-400">
          {{ t('results.loadingMessage') }}
        </p>
        <div v-else-if="scrapeProgress.total > 0" class="text-center">
          <p class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {{ t('results.foundTrains', { total: scrapeProgress.total }) }}
          </p>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('results.gettingInfo', { current: scrapeProgress.current, total: scrapeProgress.total }) }}
          </p>
          <div class="mt-4 w-64 mx-auto">
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-primary h-2 rounded-full transition-all duration-300"
                :style="{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-red-500 mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {{ t('results.error') }}
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          {{ error.message }}
        </p>
        <UButton @click="refresh">
          {{ t('results.retry') }}
        </UButton>
      </div>

      <!-- Results -->
      <div v-else-if="data">
        <UCard>
          <template #header>
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ t(fromCity.translationKey) }} → {{ t(toCity.translationKey) }}
                </h2>
                <div class="flex items-center gap-2 mt-1">
                  <UButton
                    icon="i-heroicons-chevron-left"
                    size="xs"
                    variant="ghost"
                    :loading="isNavigatingPrevious"
                    :disabled="isNavigatingPrevious || isToday"
                    @click="navigateToPreviousDay"
                  />
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ date }}
                  </p>
                  <UButton
                    icon="i-heroicons-chevron-right"
                    size="xs"
                    variant="ghost"
                    :loading="isNavigatingNext"
                    :disabled="isNavigatingNext"
                    @click="navigateToNextDay"
                  />
                </div>
              </div>

              <!-- Direct trains toggle -->
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {{ t('results.allTrains') }}
                </span>
                <USwitch v-model="showDirectOnly" :disabled="!hasDirectTrains" />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {{ t('results.directOnly') }}
                </span>
              </div>
            </div>

            <!-- Time range filters -->
            <div class="mt-4 space-y-2">
              <div class="flex justify-between items-center text-sm text-gray-700 dark:text-gray-300">
                <span>{{ t('results.earliestDeparture') }}: <strong>{{ earliestTime }}</strong></span>
                <span>{{ t('results.latestDeparture') }}: <strong>{{ latestTime }}</strong></span>
              </div>
              <USlider
                v-model="timeRange"
                :min="0"
                :max="1439"
                :step="15"
                color="primary"
                size="md"
              />
            </div>

            <!-- No direct trains message -->
            <div v-if="!hasDirectTrains" class="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p class="text-sm text-yellow-800 dark:text-yellow-200">
                <UIcon name="i-heroicons-information-circle" class="inline-block mr-1" />
                {{ t('results.noDirectTrains') }}
              </p>
            </div>

            <!-- Stats and scraped timestamp -->
            <div v-if="data.stats" class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p class="text-sm text-blue-800 dark:text-blue-200">
                <UIcon name="i-heroicons-sparkles" class="inline-block mr-1" />
                {{ t('results.statsSaved', { clicks: data.stats.clicksSaved, pages: data.stats.pagesVisited }) }}
              </p>
              <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {{ t('results.scrapedAt') }}: {{ formatTimestamp(data.scrapedAt) }}
              </p>
            </div>
          </template>

          <!-- No results -->
          <div v-if="filteredDepartures.length === 0" class="text-center py-8">
            <p class="text-gray-600 dark:text-gray-400">
              {{ t('results.noResults') }}
            </p>
          </div>

          <!-- Results Table -->
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.departure') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.arrival') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.duration') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.changes') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.operator') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.secondClass') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.secondClassCalm') }}
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.firstClass') }}
                </th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ t('results.book') }}
                </th>
              </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="(departure, index) in filteredDepartures"
                :key="index"
                class="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {{ departure.departureTime }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {{ departure.arrivalTime }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ formatDuration(departure.duration) }}
                  <UIcon
                    v-if="isSignificantlyLonger(departure.duration)"
                    name="i-heroicons-exclamation-triangle"
                    class="inline-block ml-1 text-yellow-500"
                    :title="`Significantly longer than average (${Math.round(averageDuration / 60)} h ${averageDuration % 60} min)`"
                  />
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ formatChanges(departure.changes) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ translateOperator(departure.operator) || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" :class="departure.prices.secondClass.available ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'">
                  {{ formatPrice(departure.prices.secondClass.price, departure.prices.secondClass.available) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" :class="departure.prices.secondClassCalm.available ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'">
                  {{ formatPrice(departure.prices.secondClassCalm.price, departure.prices.secondClassCalm.available) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" :class="departure.prices.firstClass.available ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'">
                  {{ formatPrice(departure.prices.firstClass.price, departure.prices.firstClass.available) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <UButton
                    :to="departure.bookingUrl"
                    target="_blank"
                    external
                    size="sm"
                  >
                    {{ t('results.book') }}
                  </UButton>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <!-- Back button -->
        <div class="mt-6">
          <UButton
            to="/"
            variant="ghost"
            icon="i-heroicons-arrow-left">
            Tillbaka till sökning
          </UButton>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { SWEDISH_CITIES } from '~/utils/cities';

const route = useRoute();
const { t } = useI18n();
const colorMode = useColorMode();

// Get route params
const date = route.params.date as string;
const fromSlug = route.params.from as string;
const toSlug = route.params.to as string;

// Map slugs to station names
const fromCity = SWEDISH_CITIES.find((c) => c.id === fromSlug);
const toCity = SWEDISH_CITIES.find((c) => c.id === toSlug);

if (!fromCity || !toCity) {
  throw createError({ statusCode: 404, message: 'City not found' });
}

// Set dynamic page title
useHead({
  title: `${t(fromCity.translationKey)} → ${t(toCity.translationKey)} - ${date} | SJ Tågsök`,
  meta: [
    { name: 'description', content: `Tågförbindelser från ${t(fromCity.translationKey)} till ${t(toCity.translationKey)} den ${date}. Jämför priser och tider.` },
  ],
});

// Validate that date is not in the past
const selectedDate = new Date(date);
const today = new Date();
today.setHours(0, 0, 0, 0);
selectedDate.setHours(0, 0, 0, 0);

const isDateInPast = selectedDate < today;
const isToday = selectedDate.getTime() === today.getTime();

// Direct trains filter toggle
const showDirectOnly = ref(false);

// Save direct filter preference to localStorage when it changes
watch(showDirectOnly, () => {
  localStorage.setItem('sj-direct-filter', JSON.stringify(showDirectOnly.value));
});

// Time range filters (in minutes from midnight: 0-1439)
const timeRange = ref([0, 1439]); // Default: 00:00 to 23:59

// Helper functions to convert between time strings and minutes
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours * 60) + minutes;
};

const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Computed properties for display
const earliestTime = computed(() => minutesToTime(timeRange.value[0]));
const latestTime = computed(() => minutesToTime(timeRange.value[1]));

// Save time filters to localStorage when they change
watch(timeRange, () => {
  localStorage.setItem('sj-time-filters', JSON.stringify({
    earliest: earliestTime.value,
    latest: latestTime.value,
  }));
}, { deep: true });

// Navigation loading states
const isNavigatingPrevious = ref(false);
const isNavigatingNext = ref(false);

// Scraping state
const data = ref<any>(null);
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const error = ref<Error | null>(null);
const scrapeProgress = ref({ current: 0, total: 0 });
const statusMessage = ref('');

// Fetch data using EventSource for progress updates
const fetchWithProgress = async() => {
  status.value = 'pending';
  error.value = null;
  scrapeProgress.value = { current: 0, total: 0 };
  statusMessage.value = '';

  const params = new URLSearchParams({
    from: fromCity.stationName,
    to: toCity.stationName,
    date,
  });

  console.log('Connecting to EventSource:', `/api/scrape-stream?${params}`);
  const eventSource = new EventSource(`/api/scrape-stream?${params}`);

  eventSource.onopen = () => {
    console.log('EventSource connection opened');
  };

  eventSource.onmessage = (event) => {
    console.log('Received SSE message:', event.data);
    try {
      const message = JSON.parse(event.data);
      console.log('Parsed message:', message);

      if (message.type === 'status') {
        statusMessage.value = message.message;
      }
      else if (message.type === 'progress') {
        scrapeProgress.value = {
          current: message.current,
          total: message.total,
        };
      }
      else if (message.type === 'complete') {
        console.log('Received complete data:', message.data);
        data.value = message.data;
        status.value = 'success';
        eventSource.close();
      }
      else if (message.type === 'error') {
        error.value = new Error(message.message);
        status.value = 'error';
        eventSource.close();
      }
    }
    catch (err) {
      console.error('Error parsing SSE message:', err, event.data);
    }
  };

  eventSource.onerror = (err) => {
    console.error('EventSource error:', err, 'ReadyState:', eventSource.readyState);
    error.value = new Error('Connection error');
    status.value = 'error';
    eventSource.close();
  };
};

const refresh = () => {
  fetchWithProgress();
};

// Load settings and fetch data when component is mounted
onMounted(async() => {
  // Load direct filter preference from localStorage
  const storedDirectFilter = localStorage.getItem('sj-direct-filter');
  if (storedDirectFilter !== null) {
    showDirectOnly.value = JSON.parse(storedDirectFilter);
  }

  // Load time filters from localStorage
  const stored = localStorage.getItem('sj-time-filters');
  if (stored) {
    const filters = JSON.parse(stored);
    const earliest = filters.earliest || '00:00';
    const latest = filters.latest || '23:59';
    timeRange.value = [timeToMinutes(earliest), timeToMinutes(latest)];
  }

  // Fetch data (only if date is not in the past)
  if (!isDateInPast) {
    await fetchWithProgress();
  }
});

// Filter departures based on toggle and time range
const filteredDepartures = computed(() => {
  if (!data.value?.departures) return [];

  let filtered = data.value.departures;

  // Filter by direct trains if enabled
  if (showDirectOnly.value) {
    filtered = filtered.filter((d) => d.changes === 0);
  }

  // Filter by time range
  filtered = filtered.filter((d) => {
    const departureTime = d.departureTime;
    return departureTime >= earliestTime.value && departureTime <= latestTime.value;
  });

  return filtered;
});

// Check if there are any direct trains available
const hasDirectTrains = computed(() => {
  return data.value?.departures.some((d) => d.changes === 0) || false;
});

// Parse duration string to minutes
const parseDurationToMinutes = (duration: string): number => {
  const hourMatch = duration.match(/(\d+)\s*h/);
  const minMatch = duration.match(/(\d+)\s*min/);

  const hours = hourMatch && hourMatch[1] ? Number.parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch && minMatch[1] ? Number.parseInt(minMatch[1], 10) : 0;

  return (hours * 60) + minutes;
};

// Format duration to show hours and minutes properly
const formatDuration = (duration: string): string => {
  const totalMinutes = parseDurationToMinutes(duration);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${minutes} min`;
};

// Calculate average duration for all departures
const averageDuration = computed(() => {
  if (!data.value?.departures || data.value.departures.length === 0) return 0;

  const totalMinutes = data.value.departures.reduce((sum, d) => {
    return sum + parseDurationToMinutes(d.duration);
  }, 0);

  return totalMinutes / data.value.departures.length;
});

// Check if duration is significantly longer than average (>30% longer)
const isSignificantlyLonger = (duration: string): boolean => {
  const durationMinutes = parseDurationToMinutes(duration);
  const avg = averageDuration.value;
  return avg > 0 && durationMinutes > (avg * 1.3);
};

// Format changes text
const formatChanges = (changes: number): string => {
  if (changes === 0) return t('results.direct');
  if (changes === 1) return `1 ${t('results.change')}`;
  return `${changes} ${t('results.changes')}`;
};

// Format price
const formatPrice = (price: number | null, available: boolean): string => {
  if (!available || price === null) return t('results.unavailable');
  return `${price} SEK`;
};

// Date navigation
const navigateToPreviousDay = () => {
  isNavigatingPrevious.value = true;
  const currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() - 1);
  const previousDate = currentDate.toISOString().split('T')[0];
  navigateTo(`/${previousDate}/${fromSlug}/${toSlug}`);
};

const navigateToNextDay = () => {
  isNavigatingNext.value = true;
  const currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() + 1);
  const nextDate = currentDate.toISOString().split('T')[0];
  navigateTo(`/${nextDate}/${fromSlug}/${toSlug}`);
};

const toggleTheme = () => {
  colorMode.preference = (colorMode.value === 'dark' ? 'light' : 'dark');
};

// Format timestamp to readable format
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just nu';
  if (diffMins < 60) return `${diffMins} min sedan`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} h sedan`;

  // Show full date/time if more than 24 hours
  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Translate operator names to Swedish
const translateOperator = (operator: string): string => {
  const translations: Record<string, string> = {
    'SJ High': 'SJ Snabbtåg',
    'SJ Night': 'SJ Natttåg',
  };

  return translations[operator] || operator;
};
</script>
