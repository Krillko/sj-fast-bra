# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Nuxt 4 application that scrapes train schedules and prices from SJ.se (Swedish Railways) using Puppeteer for browser automation. The application serves as a search interface that provides cached train data and booking links.

**Status**: Step 7 of PLAN.md is complete. The application now has a fully functional UI with search, results display, real-time progress tracking, and comprehensive filtering options.

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

## Architecture Overview

### Core Technologies
- **Framework:** Nuxt 4 with Vue 3.5+
- **UI Library:** Nuxt UI v4 (built on TailwindCSS and Headless UI)
- **Scraping:** Puppeteer (headless Chrome for client-side rendered content)
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
│   │   ├── scrape.ts        # Main scraping endpoint with caching
│   │   └── scrape-stream.ts # SSE endpoint for real-time progress
│   └── utils/
│       ├── cache.ts         # Cache helper functions
│       └── puppeteer.ts     # Puppeteer scraping implementation
├── i18n/
│   ├── locales/
│   │   └── sv.json          # Swedish translations
│   └── config.ts            # i18n configuration
├── public/
│   └── logo/
│       └── Sena-Jamt.svg    # Application logo
├── nuxt.config.ts           # Nuxt configuration
└── PLAN.md                  # Original implementation plan (reference)
```

### Data Flow

1. **User Search:**
   - User selects cities and date on index page (`/`)
   - Navigation to `/{date}/{from}/{to}`
   - Results page connects to `/api/scrape-stream` via SSE

2. **Scraping with Real-time Progress:**
   - Check cache first (1-hour TTL)
   - If not cached, scrape SJ.se with Puppeteer
   - Server-Sent Events (SSE) provide real-time updates:
     - Status messages ("Opening website...", "Scrolling to load all trains...")
     - Progress tracking (X/Y trains processed)
     - Final results when complete
   - Results cached after scraping

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

## Scraping Implementation Details

### Target Site Challenges
- **Client-side rendered:** Requires JavaScript execution (Puppeteer needed, not Cheerio)
- **Infinite scroll:** Must scroll to bottom to load all departures before processing
- **Session state:** Each departure must be clicked individually to reveal prices
- **No direct URLs:** Options don't have unique identifiers in URL

### Scraping Flow
1. Navigate to SJ.se search results page
2. Scroll incrementally to bottom to trigger lazy loading of all departures
3. Wait for all content to load
4. Iterate through each departure option:
   - Click to expand
   - Extract prices and availability for 3 tiers (Economy, Standard, First Class)
   - Extract booking link/identifier
   - Reset for next option

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
- Use Puppeteer with human-like behavior (random delays, smooth scrolling)
- Implement comprehensive error handling for:
  - No trains available
  - Sold out prices
  - Page structure changes
  - Timeouts (> 30 seconds)
  - Scroll failures
- Add bot detection mitigation strategies
- Protect `/api/update-cache` with Authorization header token (environment variable)

### Booking Deep Links Strategy
During scraping, investigate three approaches in order:
1. Extract direct URL with departure identifier from DOM
2. Reconstruct URL with query parameters
3. Fallback to generic search page URL

Goal: Provide "Book this train" button that deep links with specific departure pre-selected.

### Performance Considerations
- Puppeteer uses ~500MB RAM per instance
- Expected low-medium traffic (< 10 concurrent users)
- 20-30 second wait acceptable for uncached routes
- Use single page context and navigate back between clicks (fastest approach)

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
- Consider user agent rotation if bot detection issues arise

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
- [x] Puppeteer scraping implementation
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

## Working Preferences
- Full autonomy granted for all file operations in this directory
- No need to ask permission before making changes, running commands, or refactoring
- Proceed directly with implementation unless clarification is genuinely needed
