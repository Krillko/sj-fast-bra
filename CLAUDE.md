# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Nuxt 4 application that scrapes train schedules and prices from SJ.se (Swedish Railways) using Puppeteer for browser automation. The application serves as a search interface that provides cached train data and booking links.

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
- **Framework:** Nuxt 4 with Vue 3
- **Scraping:** Puppeteer (headless Chrome for client-side rendered content)
- **Hosting Target:** Cloudflare Pages/Workers
- **Caching:** Nitro built-in cache storage

### Application Structure

```
├── app/                 # Nuxt app directory
│   └── app.vue         # Root application component
├── server/api/         # API routes (to be implemented)
│   ├── scrape.ts      # On-demand scraping endpoint
│   └── update-cache.ts # Cron-triggered pre-caching endpoint
├── nuxt.config.ts      # Nuxt configuration
└── PLAN.md            # Detailed implementation plan
```

### Data Flow

1. **Popular Routes (Pre-cached):**
   - `/api/update-cache` endpoint called hourly by external cron
   - Scrapes 9x9 = 81 route combinations
   - Caches results in Nitro storage with 1-hour TTL
   - Users get instant results

2. **Unpopular Routes (On-demand):**
   - `/api/scrape` endpoint called when user requests uncached route
   - Takes 20-30 seconds to complete
   - Results cached after first scrape

### Cache Key Structure
Format: `sj:{from}:{to}:{date}`
Example: `sj:stockholm-central:malmo-central:2025-12-21`

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

### Expected JSON Output Structure
```json
{
  "route": "Stockholm Central → Malmö Central",
  "date": "2025-12-21",
  "scrapedAt": "2025-01-20T10:30:00Z",
  "departures": [
    {
      "departureTime": "06:00",
      "arrivalTime": "10:30",
      "duration": "4h 30m",
      "prices": {
        "economy": { "price": 195, "available": true },
        "standard": { "price": 395, "available": true },
        "first": { "price": 595, "available": false }
      },
      "bookingUrl": "https://www.sj.se/..."
    }
  ]
}
```

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

- **TypeScript:** Uses Nuxt's generated tsconfig references (`.nuxt/tsconfig.*.json`)
- **Compatibility Date:** 2025-07-15
- **Devtools:** Enabled in development
- **Popular Routes:** 9 Swedish cities (to be defined) in all combinations

## Security Notes
- Environment variables required for `/api/update-cache` authentication token
- Rate limiting to protect target site
- Consider user agent rotation if bot detection issues arise

### Coding Style Preferences
- **Modern JavaScript**: Prefer modern JavaScript features and methods when they improve readability or expressiveness (e.g., use `array.at(-1)` instead of `array[array.length - 1]`, optional chaining `?.`, nullish coalescing `??`, etc.)
- **Array methods over loops**: Prefer functional array methods (`.map()`, `.filter()`, `.reduce()`, `.forEach()`, `.find()`, `.some()`, `.every()`, etc.) over traditional `for` loops when working with arrays
- **Modern Vue/Nuxt APIs**: Use newer APIs and composables that match the project's Vue 3.5+ and Nuxt 3.19+ versions (e.g., use `useTemplateRef('refName')` instead of `ref<HTMLElement | null>(null)` for template refs, prefer Composition API patterns, use auto-imported composables)
- **External API documentation**: When working with external APIs (e.g., Google Maps, payment providers, third-party services), always consult the official documentation to ensure correct usage of methods, events, and best practices
- **Latest API versions**: When writing new code with external APIs, always use the latest version of the API. If existing code uses an older version, ask the user whether to update it or match the existing version
- **ESLint**: After making code changes, run `npx eslint --fix [files]` to automatically fix formatting and linting issues
- Use parentheses around comparison expressions in boolean assignments (e.g., `const isLocal = (environment === 'local');`)

## Working Preferences
- Full autonomy granted for all file operations in this directory
- No need to ask permission before making changes, running commands, or refactoring
- Proceed directly with implementation unless clarification is genuinely needed
