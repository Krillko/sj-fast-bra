<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { SWEDISH_CITIES } from '~/utils/cities';

const { t } = useI18n();
const router = useRouter();
const colorMode = useColorMode();

// Form state
const fromCity = ref('');
const toCity = ref('');
const travelDate = ref('');
const directOnly = ref(false);
const isLoading = ref(false);

// Validation errors
const errors = ref({
  date: '',
  cities: '',
});

// City options for select dropdowns
const cityOptions = SWEDISH_CITIES.map((city) => ({
  value: city.id,
  label: t(city.translationKey),
}));

// Set default date to today
onMounted(() => {
  const today = new Date();
  travelDate.value = today.toISOString().split('T')[0];
});

// Validation function
const validateForm = (): boolean => {
  errors.value = { date: '', cities: '' };
  let isValid = true;

  // Validate date (must be today or future)
  const selectedDate = new Date(travelDate.value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedDate < today) {
    errors.value.date = t('search.validation.invalidDate');
    isValid = false;
  }

  // Validate cities (must be different)
  if (fromCity.value === toCity.value) {
    errors.value.cities = t('search.validation.sameCity');
    isValid = false;
  }

  return isValid;
};

// Handle form submission
const handleSearch = () => {
  if (!validateForm()) {
    return;
  }

  // Set loading state
  isLoading.value = true;

  // Navigate to results page
  router.push(`/${travelDate.value}/${fromCity.value}/${toCity.value}`);
};

// Toggle theme
const toggleTheme = () => {
  colorMode.preference = (colorMode.value === 'dark' ? 'light' : 'dark');
};
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header with logo and theme toggle -->
    <header class="bg-white dark:bg-gray-800 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex justify-between items-center">
          <!-- Logo (5:1 aspect ratio) -->
          <div class="flex-1 max-w-3xl">
            <div class="bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center" style="aspect-ratio: 5/1;">
              <img src="/logo/Sena-Jamt.svg" class="w-full" alt="Sena Jämt">
            </div>
          </div>

          <!-- Theme toggle -->
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

    <!-- Main content -->
    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <UCard>
        <template #header>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ t('search.from') }} → {{ t('search.to') }}
          </h2>
        </template>

        <div class="space-y-6">
          <!-- From City -->
          <UFormField :label="t('search.from')" :error="errors.cities">
            <USelect
              v-model="fromCity"
              :items="cityOptions"
              :placeholder="t('search.from')"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <!-- To City -->
          <UFormField :label="t('search.to')">
            <USelect
              v-model="toCity"
              :items="cityOptions"
              :placeholder="t('search.to')"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <!-- Date -->
          <UFormField :label="t('search.date')" :error="errors.date">
            <UInput
              v-model="travelDate"
              type="date"
              size="lg"
            />
          </UFormField>

          <!-- Direct trains only checkbox -->
          <UFormField>
            <UCheckbox
              v-model="directOnly"
              :label="t('search.directOnly')"
            />
          </UFormField>

          <!-- Time warning -->
          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p class="text-sm text-blue-800 dark:text-blue-200">
              <UIcon name="i-heroicons-information-circle" class="inline-block mr-1" />
              {{ t('search.timeWarning') }}
            </p>
          </div>

          <!-- Submit button -->
          <UButton
            block
            size="lg"
            :loading="isLoading"
            :disabled="isLoading"
            @click="handleSearch"
          >
            {{ isLoading ? t('search.searching') : t('search.go') }}
          </UButton>
        </div>
      </UCard>
    </main>
  </div>
</template>
