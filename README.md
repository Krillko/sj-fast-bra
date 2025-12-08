# SJ Tågsök - Fast Train Search

A Nuxt 4 application that scrapes train schedules and prices from SJ.se (Swedish Railways) and provides a fast, comprehensive interface for comparing train options.

## Features

- 🔍 Search train connections between 50+ Swedish cities
- 💰 Compare prices across 3 ticket classes (2nd class, 2nd class calm, 1st class)
- 🎯 Filter by direct trains only
- ⏰ Time range filtering with adjustable sliders
- 📊 Real-time scraping progress with Server-Sent Events (SSE)
- 🌓 Dark/light mode support
- 📅 Easy date navigation (previous/next day)
- 🚄 Operator information display
- 📈 Statistics showing pages/clicks saved
- 🌐 Internationalization ready (Swedish UI)

## Tech Stack

- **Framework:** Nuxt 4 with Vue 3.5+
- **UI Library:** [Nuxt UI](https://ui.nuxt.com/) v4 - Beautiful, accessible components built on TailwindCSS
- **Scraping:** Puppeteer for browser automation
- **i18n:** @nuxtjs/i18n for internationalization
- **Caching:** Nitro storage layer (filesystem for dev, Cloudflare KV for production)
- **Icons:** Heroicons and Lucide via Iconify

## Installation

We use NVM to ensure consistent Node.js versions.
Prerequisites: NVM and Homebrew installed on your computer

### Setup HTTPS (Required for local development)

```sh
# Install mkcert for creating a valid certificate (Mac OS):
$ brew install mkcert
$ mkcert -install
```

### First Time Setup

Run in this directory:

```sh
# Generate local SSL certificates
$ mkcert localhost

# This creates localhost.pem and localhost-key.pem

# Install correct Node.js version
$ nvm install
$ nvm use

# Install dependencies
$ npm install
```

**Important:** Always run `nvm use` before any npm install

### Starting Development Server

Run in this directory:

```sh
$ nvm use
$ npm run dev
```

The app will be available at https://localhost:3000 (note: HTTPS, not HTTP)

## Project Structure

```
├── app/
│   ├── app.vue              # Root component
│   ├── pages/
│   │   ├── index.vue        # Search form page
│   │   └── [date]/[from]/[to].vue  # Results page
│   └── utils/
│       └── cities.ts        # City definitions (50+ Swedish stations)
├── server/
│   ├── api/
│   │   ├── scrape.ts        # Main scraping endpoint
│   │   └── scrape-stream.ts # SSE endpoint for real-time progress
│   └── utils/
│       ├── cache.ts         # Cache helper functions
│       └── puppeteer.ts     # Puppeteer scraping logic
├── i18n/
│   └── locales/
│       └── sv.json          # Swedish translations
├── public/
│   └── logo/
│       └── Sena-Jamt.svg    # Application logo
└── nuxt.config.ts           # Nuxt configuration
```

## How It Works

### User Flow

1. **Search**: User selects origin, destination, and date
2. **Scraping**: Puppeteer visits SJ.se and extracts all train data
3. **Progress**: Real-time updates via Server-Sent Events (SSE)
4. **Display**: All trains shown in a comprehensive table with filtering options
5. **Booking**: Direct links to SJ.se for selected trains

### Caching

This project uses Nitro's storage layer powered by [Unstorage](https://unstorage.unjs.io):

- **Local Development**: Filesystem storage (`.cache/` directory)
- **Production**: Cloudflare KV for persistent, distributed caching

Cache keys format: `sj:{from}:{to}:{date}`
TTL: 1 hour (3600 seconds)

### Cache Helper Functions

Available in server routes:

```ts
// Cache with automatic key generation
await useCache(
  'my-unique-key',
  async () => {
    // Expensive operation
    return await fetchData();
  },
  { ttl: 3600, prefix: 'sj' }
);

// Manual cache operations
const storage = useStorage('cache');
await storage.setItem(key, data, { ttl: 3600 });
const cached = await storage.getItem(key);
await storage.remove(key);
```

See `server/utils/cache.ts` for implementation details.

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Generate static site
npm run generate

# Lint code
npm run lint

# Lint and auto-fix issues
npm run lint:fix
```

## UI Components

The project uses [Nuxt UI](https://ui.nuxt.com/), which provides:

- Pre-built accessible components (UButton, UCard, UInput, etc.)
- Built on TailwindCSS and Headless UI
- Dark mode support out of the box
- Customizable with Tailwind utilities
- Icon system via Iconify (Heroicons, Lucide)

### Key Components Used

- **UCard** - Container for forms and results
- **UButton** - Actions and navigation
- **USelectMenu** - Searchable city selection
- **UInput** - Date picker and text inputs
- **USwitch** - Toggle filters (direct trains)
- **USlider** - Time range selection
- **UCheckbox** - Form options
- **UIcon** - Icon rendering
- **UFormField** - Form field with label and error handling

## Internationalization

Currently supports Swedish (sv) with structure ready for additional languages:

- Translations in `i18n/locales/sv.json`
- Uses `@nuxtjs/i18n` module
- All UI text externalized for easy translation
- Code and documentation remain in English

To add a new language:

1. Create `i18n/locales/{code}.json`
2. Add locale config to `nuxt.config.ts`
3. Translate all keys from `sv.json`

## Contributing

This is a personal project, but suggestions and bug reports are welcome via GitHub issues.
