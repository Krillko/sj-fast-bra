# SJ Tågsök - Fast Train Search

A Nuxt 4 application that fetches train schedules and prices from SJ.se (Swedish Railways) via SJ's public booking API and provides a fast, comprehensive interface for comparing train options.

## Features

- 🔍 Search train connections between 50+ Swedish cities
- 💰 Compare prices across 3 ticket classes (2nd class, 2nd class calm, 1st class)
- 🎯 Filter by direct trains only
- ⏰ Time range filtering with adjustable sliders
- 📊 Real-time progress with Server-Sent Events (SSE)
- 🌓 Dark/light mode support
- 📅 Easy date navigation (previous/next day)
- 🚄 Operator information display
- 📈 Statistics showing pages/clicks saved
- 🌐 Internationalization ready (Swedish UI)

## Tech Stack

- **Framework:** Nuxt 4 with Vue 3.5+
- **UI Library:** [Nuxt UI](https://ui.nuxt.com/) v4 - Beautiful, accessible components built on TailwindCSS
- **Data fetching:** SJ public booking JSON API (`prod-api.adp.sj.se`) via `fetch` — no browser automation
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
│       ├── sjApi.ts         # SJ booking API client
│       └── stations.ts      # Station name → UIC code lookup
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
2. **Fetch**: The server calls SJ's booking API (search → departures → per-departure offers)
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

## Performance & Data Access

### Current Performance

- **Whole route:** ~2 seconds uncached (all departures, full pricing)
- **Caching:** Each departure cached for 1 hour; route metadata for fast reloads
- **Cache hit:** < 10ms

The app calls SJ's public booking API directly (the same API the sj.se frontend
uses) — no headless browser. This is both far faster and not subject to the per-IP
"8 departures" block that the earlier Puppeteer approach hit. See `HISTORY.md` for the
full record of approaches tried and why the API approach won.

### Responsible access

SJ.se is operated by SJ AB, a Swedish state-owned company. This app makes the same
read-only requests the website's own frontend makes, at lower volume, with aggressive
caching. If access ever breaks, the preferred path is to request official API access
rather than aggressive workarounds.

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

## Deployment (Cloudflare Workers)

The app deploys to Cloudflare Workers using Nitro's `cloudflare_module` preset. The
KV namespace `CACHE` (bound in `wrangler.jsonc`) backs the production cache.

### One-time setup

```bash
# Authenticate wrangler with your Cloudflare account (opens browser)
npx wrangler login

# Create the KV namespace and copy its id into wrangler.jsonc → kv_namespaces[].id
npx wrangler kv namespace create CACHE
```

### Deploy

```bash
# Build with the Cloudflare preset + production env (so the KV cache driver is used)
NITRO_PRESET=cloudflare_module NUXT_PUBLIC_ENVIRONMENT=production npm run build

# Publish
npx wrangler deploy
```

This produces a `https://sj-fast-bra.<your-subdomain>.workers.dev` URL.

### Notes

- **Subscription key:** `runtimeConfig.sj.subscriptionKey` ships a working public default;
  override per-environment with the `SJ_SUBSCRIPTION_KEY` Worker secret/var if desired.
- **Free-tier limit:** Cloudflare's free plan allows **50 external subrequests per request**.
  Each search does 1 (search) + 1 (departures) + one offer call per departure, so routes
  with more than ~48 departures (e.g. Stockholm↔Uppsala) return ~48 priced departures and
  flag the result `incomplete`. The Workers Paid plan ($5/mo) raises the cap to 10,000.

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
