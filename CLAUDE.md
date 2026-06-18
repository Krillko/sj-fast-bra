# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Nuxt 4 application that fetches train schedules and prices from SJ.se (Swedish Railways). The application serves as a search interface that provides cached train data and booking links.

**Data source**: The app calls SJ's public booking JSON API (`prod-api.adp.sj.se`) directly — the same API the sj.se frontend uses. It does **not** use Puppeteer/browser automation anymore (see "Data Fetching" below, and HISTORY.md for the full record of approaches tried).

**Status**: The application has a fully functional UI with search, results display, real-time progress tracking, and comprehensive filtering options.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
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

Chrome MCP Server is available for testing

## Architecture Overview

### Core Technologies
- **Framework:** Nuxt 4 with Vue 3.5+
- **UI Library:** Nuxt UI v4 (built on TailwindCSS and Headless UI)
- **Data Fetching:** SJ public booking JSON API (`prod-api.adp.sj.se`) via plain `fetch` — no browser automation
- **i18n:** @nuxtjs/i18n for internationalization (currently Swedish)
- **Icons:** @iconify-json/heroicons and @iconify-json/lucide
- **Hosting Target:** Cloudflare Pages/Workers
- **Caching:** Nitro built-in cache storage (filesystem dev, Cloudflare KV production)

### Application Structure

```
├── app/
│   ├── app.vue              # Root application component
│   ├── pages/
│   │   ├── index.vue        # Search form page (Nuxt UI components)
│   │   └── [date]/[from]/[to].vue  # Results page with table display
│   └── utils/
│       └── cities.ts        # 50+ Swedish train station definitions
├── server/
│   ├── api/
│   │   ├── scrape.ts        # Main endpoint with caching (orchestrates sjApi)
│   │   └── scrape-stream.ts # SSE endpoint for real-time progress
│   └── utils/
│       ├── cache.ts         # Cache helper functions
│       ├── sjApi.ts         # SJ booking API client (search → departures → offers)
│       └── stations.ts      # Station name → UIC code lookup
├── i18n/
│   ├── locales/
│   │   └── sv.json          # Swedish translations
│   └── config.ts            # i18n configuration
├── public/
│   └── logo/
│       └── Sena-Jamt.svg    # Application logo
├── nuxt.config.ts           # Nuxt configuration
└── HISTORY.md               # Record of every data-fetching approach tried
```

### Data Flow

1. **User Search:**
   - User selects cities and date on index page (`/`)
   - Navigation to `/{date}/{from}/{to}`
   - Results page connects to `/api/scrape-stream` via SSE

2. **Fetching with Real-time Progress:**
   - Check cache first (1-hour TTL)
   - If not cached, call the SJ booking API (see "Data Fetching Implementation")
   - Server-Sent Events (SSE) provide real-time updates:
     - Status messages
     - Progress tracking (X/Y departures priced)
     - Individual departures streamed as their offers resolve
     - Final results when complete
   - Results cached after fetching

3. **Results Display:**
   - Comprehensive table showing all departures
   - Client-side filtering:
     - Direct trains only toggle
     - Time range slider (earliest/latest departure)
   - Date navigation (previous/next day)
   - Direct booking links to SJ.se

### Cache Key Structure
Format: `sj:{from}:{to}:{date}`
Example: `sj:Stockholm Central:Malmö Central:2025-12-21`
TTL: 3600 seconds (1 hour)

## Data Fetching Implementation

The app talks to SJ's public booking API directly (`server/utils/sjApi.ts`). This is the same Azure API Management backend (`prod-api.adp.sj.se`) the sj.se frontend uses. No browser, no login, no cookies.

### API Flow (3 calls)

1. **`POST /public/sales/booking/v3/search`**
   Body: `{ origin, destination, departureDate, returnDate: "", passengers: [{ passengerCategory: { type: "ADULT" } }] }`
   `origin`/`destination` are **UIC station codes** (e.g. Stockholm C `740000001`, Malmö C `740000003`).
   → returns `{ departureSearchId, passengerListId }`.

2. **`GET /public/sales/booking/v3/departures/search/{departureSearchId}`**
   → all departures (times, duration, `numberOfChanges`, legs with `serviceType`). No prices.

3. **`GET /public/sales/booking/v3/departures/{departureId}/offers?passengerListId={passengerListId}`** (one per departure, fetched with bounded concurrency)
   → prices: `seatOffers.offers.{SECOND, SECOND_CALM, FIRST}.priceFrom.price` + `.available`, plus `bedOffers` for night trains and a convenience `priceFrom`.

### Authentication

A single static header: `Ocp-Apim-Subscription-Key`. This is a **public** value baked into SJ's frontend JS bundle (an Azure APIM client identifier, not a user credential). It is sent by every visitor's browser.

- Configured in `runtimeConfig.sj.subscriptionKey` (default committed; override via `SJ_SUBSCRIPTION_KEY` env var).
- `sjApi.ts` **auto-extracts** a fresh key from sj.se if the configured one ever returns 401 (handles SJ rotating it in a new deploy): it crawls the JS bundle import graph, collects 32-hex key candidates, and validates each against a cheap search call.
- Other required headers (all static): `x-client-name: sjse-booking-client`, `x-client-version`, `Accept-Language`, `Content-Type`, `Ocp-Apim-Trace`.

### Station Codes

The frontend passes station **names**; the server resolves them to UIC codes via `server/utils/stations.ts` (52 stations). `app/utils/cities.ts` also carries `uicStationCode` per city. Keep the two in sync when adding stations.

### Why not Puppeteer?

The original implementation scraped the rendered page with a headless browser. SJ blocked it after exactly 8 departure-detail page loads per IP. Extensive testing (see HISTORY.md) showed this was an artifact of the **browser navigation/fingerprinting**, not the API: direct API calls fetch all departures (tested 20+/20+, 76 for Stockholm→Uppsala) with no limit, in ~2s vs 20–90s. Puppeteer was removed entirely (revertable via git history).

### Notes / Edge Cases

- **Night trains** have `bedOffers` instead of seat offers; `sjApi.ts` surfaces the cheapest bed price in the second-class slot so a price still shows.
- **Multi-leg journeys** (changes > 0): `operator` is the unique `serviceType` names joined with " + " (e.g. "SJ Nattåg + SJ InterCity").
- Already-departed trains are filtered out (5-minute buffer) in `scrape.ts`.
- High-frequency routes (e.g. Stockholm→Uppsala, ~76 departures) issue one offers call each at concurrency 5 — still a few seconds, but be mindful of load.

### Actual JSON Output Structure
```json
{
  "route": "Stockholm Central → Malmö Central",
  "date": "2025-12-21",
  "scrapedAt": "2025-01-20T10:30:00Z",
  "stats": {
    "clicksSaved": 14,
    "pagesVisited": 29
  },
  "departures": [
    {
      "departureTime": "06:00",
      "arrivalTime": "10:30",
      "duration": "4h 30min",
      "changes": 0,
      "operator": "SJ High",
      "prices": {
        "secondClass": { "price": 195, "available": true },
        "secondClassCalm": { "price": 395, "available": true },
        "firstClass": { "price": 595, "available": false }
      },
      "bookingUrl": "https://www.sj.se/en/search-journey/choose-ticket-type/..."
    }
  ]
}
```

**Notes:**
- `changes`: Number of transfers (0 = direct train)
- `operator`: Train operator (e.g., "SJ High", "SJ Night")
- `stats`: Tracks user experience improvement (pages/clicks saved)
- `duration`: Format is "Xh Ymin" (e.g., "4h 30min")
- Price tiers: secondClass, secondClassCalm, firstClass

## Implementation Guidelines

### When Building API Routes
- Use the `sjApi.ts` client; handle non-2xx responses (it already retries once on 401 with a refreshed key)
- Implement error handling for:
  - No trains available (empty `travels[0].departures`)
  - Sold out / unavailable classes (`available: false`, `price: null`)
  - Individual offers failing (skip that departure, mark result `incomplete`)
- Protect `/api/update-cache` with Authorization header token (environment variable)

### Booking Deep Links Strategy
`buildBookingUrl()` in `sjApi.ts` returns the ticket-selection page URL:
`/en/search-journey/choose-ticket-type/{from}/{to}/{date}/outward-journey`.
A future improvement could deep-link a specific departure using its `departureId`.

### Performance Considerations
- API calls are lightweight (`fetch`), no browser process / RAM overhead
- Expected low-medium traffic (< 10 concurrent users)
- Uncached routes resolve in ~2s; offers are fetched at concurrency 5 (`runtimeConfig.sj.offersConcurrency`)

## Configuration

### Nuxt Config (`nuxt.config.ts`)
- **Compatibility Date:** 2025-07-15
- **Compatibility Version:** Nuxt 4
- **Devtools:** Enabled in development
- **Modules:**
  - `@nuxt/eslint` - ESLint integration
  - `@nuxt/ui` - UI component library
  - `@nuxtjs/i18n` - Internationalization
- **Color Mode:** System preference default (supports light/dark)
- **Dev Server:** HTTPS enabled with local certificates (localhost.pem)
- **Nitro Storage:**
  - Local: Filesystem (`.cache/` directory)
  - Production: Cloudflare KV binding
- **Runtime Config (`runtimeConfig.sj`):**
    - `apiHost`: `https://prod-api.adp.sj.se`
    - `subscriptionKey`: public APIM key (override via `SJ_SUBSCRIPTION_KEY`); auto-refreshed on 401
    - `clientName` / `clientVersion`: static request headers (override version via `SJ_CLIENT_VERSION`)
    - `offersConcurrency`: parallel offer requests (default 5)

### Cities
- **Total:** 50+ Swedish train stations
- **Top 4 prioritized:** Stockholm, Göteborg, Malmö, Uppsala
- **Rest:** Alphabetically sorted (Swedish alphabet)
- **File:** `app/utils/cities.ts`

### i18n
- **Default Locale:** Swedish (sv)
- **Translation Files:** `i18n/locales/sv.json`
- **Structure:** Ready for additional languages

## UI Development with Nuxt UI

### Component Library
The project uses [Nuxt UI v4](https://ui.nuxt.com/) for all UI components. Always use Nuxt UI components instead of creating custom components.

### Commonly Used Components
- **UCard** - Container with header/footer slots
- **UButton** - Buttons with loading states, icons, variants
- **USelectMenu** - Searchable dropdown with items array
- **UInput** - Text inputs, date pickers
- **UFormField** - Wraps inputs with labels and error handling
- **USwitch** - Toggle switches for boolean values
- **USlider** - Range sliders for numeric values
- **UCheckbox** - Checkboxes with labels
- **UIcon** - Icon rendering (Heroicons and Lucide via Iconify)

### Color Mode
- Use `useColorMode()` composable to access/toggle theme
- Classes: `dark:` prefix for dark mode styles
- Preference stored automatically in localStorage

### Icon Usage
- Heroicons: `i-heroicons-{name}` (e.g., `i-heroicons-moon`)
- Lucide: `i-lucide-{name}`
- Pass to `icon` prop or use `<UIcon name="..." />`

### Best Practices
- Always check [Nuxt UI documentation](https://ui.nuxt.com/) for component APIs
- Use Nuxt UI's color system (`primary`, `gray`, etc.)
- Leverage built-in variants (`solid`, `ghost`, `soft`)
- Use auto-imported composables (no manual imports needed)

## Security Notes
- Environment variables required for `/api/update-cache` authentication token (not yet implemented)
- Rate limiting to protect target site (not yet implemented)
- `SJ_SUBSCRIPTION_KEY` can override the committed public APIM key if desired

### Writing / Copy Style
- **No em dashes (and no en dashes used as breaks)**: Never use `—` or `–` in translations, copy, UI text, or any user-facing content. Use semicolons (preferred), commas, parentheses, or separate sentences instead. The user explicitly dislikes dashes and likes semicolons.

### Coding Style Preferences
- **Modern JavaScript**: Prefer modern JavaScript features and methods when they improve readability or expressiveness (e.g., use `array.at(-1)` instead of `array[array.length - 1]`, optional chaining `?.`, nullish coalescing `??`, etc.)
- **Array methods over loops**: Prefer functional array methods (`.map()`, `.filter()`, `.reduce()`, `.forEach()`, `.find()`, `.some()`, `.every()`, etc.) over traditional `for` loops when working with arrays
- **Modern Vue/Nuxt APIs**: Use newer APIs and composables that match the project's Vue 3.5+ and Nuxt 3.19+ versions (e.g., use `useTemplateRef('refName')` instead of `ref<HTMLElement | null>(null)` for template refs, prefer Composition API patterns, use auto-imported composables)
- **External API documentation**: When working with external APIs (e.g., Google Maps, payment providers, third-party services), always consult the official documentation to ensure correct usage of methods, events, and best practices
- **Latest API versions**: When writing new code with external APIs, always use the latest version of the API. If existing code uses an older version, ask the user whether to update it or match the existing version
- **ESLint**: After making code changes, run `npx eslint --fix [files]` to automatically fix formatting and linting issues
- Use parentheses around comparison expressions in boolean assignments (e.g., `const isLocal = (environment === 'local');`)

## Implementation Status

### ✅ Completed (Step 7)
- [x] Nuxt UI component library integrated
- [x] i18n support with Swedish translations
- [x] Search page with city selection and date picker
- [x] Results page with comprehensive table display
- [x] Real-time scraping progress via Server-Sent Events (SSE)
- [x] SJ booking API client (`sjApi.ts`) — replaced Puppeteer scraping
- [x] Cache system with helper functions
- [x] Dark/light mode toggle
- [x] Direct trains filter
- [x] Time range filtering with sliders
- [x] Date navigation (previous/next day)
- [x] Operator information extraction
- [x] Statistics tracking (pages/clicks saved)
- [x] Responsive design
- [x] Loading states and error handling
- [x] 50+ Swedish cities/stations

### 🚧 Not Yet Implemented
- [ ] `/api/update-cache` endpoint for pre-caching popular routes
- [ ] External cron job setup for hourly cache updates
- [ ] Authorization token protection for cache endpoint
- [ ] Rate limiting
- [ ] Production deployment to Cloudflare
- [ ] Cloudflare KV setup for production cache

### 📝 Future Enhancements (Optional)
- [ ] Additional language support (English)
- [ ] Price history tracking
- [ ] Email alerts for price drops
- [ ] Favorite routes
- [ ] Mobile app (PWA)

## Experiment History & Documentation

**CRITICAL**: `HISTORY.md` records every data-fetching approach we've tried (and why each failed or won). Read it before exploring alternative ways to get train data — it prevents re-testing dead ends (browser back-navigation, scroll tuning, parallel scrapers, the per-IP "8 departures" block, etc.).

**`HISTORY.md` is a living document — keep appending to it.** Whenever you test a new approach, optimization, or workaround, or discover something notable about how SJ's API/site behaves, add a dated section with: hypothesis, what changed, measurements, and the keep/revert decision. Record failures too — that's the whole point (it stops us re-testing dead ends).

## Working Preferences
- Full autonomy granted for all file operations in this directory
- No need to ask permission before making changes, running commands, or refactoring
- Proceed directly with implementation unless clarification is genuinely needed
