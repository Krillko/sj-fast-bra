# Project Summary: SJ.se Train Scraper with Nuxt 4

## Project Overview
Build a Nuxt 4 application that scrapes train schedules and prices from SJ.se (Swedish Railways) and displays them to users.

## Tech Stack Decisions

### Core Technologies
- **Framework:** Nuxt 4
- **Scraping Library:** Puppeteer (headless Chrome browser automation)
- **Hosting:** Cloudflare (Pages/Workers)
- **Caching:** Nitro built-in cache storage

### Why Puppeteer?
- Target site (SJ.se) is client-side rendered only (requires JavaScript execution)
- Content loaded dynamically, Cheerio/static parsers won't work
- Install: `npm install puppeteer`

## Architecture

### Application Structure
```
Nuxt 4 App
├── UI Layer (client-side)
│   └── Display cached results or loading state
│
├── API Routes (server/api/)
│   ├── /api/scrape - On-demand scraping for unpopular routes
│   └── /api/update-cache - Hourly pre-cache of popular routes
│
└── Cache (Nitro storage)
    └── Stores JSON results by route+date
```

### Cron/Scheduling
- Endpoint: `/api/update-cache`
- External service calls it hourly (GitHub Actions, Cron-job.org, or Cloudflare Worker)
- Not real-time; users can wait 20-30 seconds for uncached routes

## Scraping Requirements

### Target Page Example
`https://www.sj.se/sok-resa/valj-resa/Stockholm%20Central/Malmö%20Central/2025-12-21`

### Challenge
- Each departure option must be clicked to reveal prices
- URLs don't contain option identifiers
- Site uses cookies/session state to track selections
- **Page uses infinite scroll** - must scroll to bottom to load all departures before processing
- Must iterate through each option, click, extract data, reset

### Scraping Flow
1. Navigate to search results page
2. **Scroll to bottom** to trigger loading of all departures (lazy loading)
3. Wait for all content to load
4. Get list of all departure options
5. For each option: click → extract prices → reset

### Data to Extract (per departure)
- Departure time
- Arrival time
- Duration
- 3 price tiers (Economy, Standard, First Class)
- Availability for each tier
- **Booking link/identifier** (to construct deep link back to SJ.se for booking)

### Output Format (JSON)
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
      "bookingUrl": "https://www.sj.se/...[deep link to this specific departure]"
    }
  ]
}
```

## Booking Deep Links

### Strategy
During scraping, need to investigate how SJ.se handles booking:
- **Option A:** Direct URL with departure identifier (ideal - if exists in DOM)
- **Option B:** Reconstruct URL with query parameters
- **Option C:** Generic search page URL (user must re-select)

### Investigation Needed
- Check if clicked departure reveals a unique booking URL/ID
- Test if URL parameters can pre-select a specific departure
- Fallback: Link to search results page (requires user to click again)

**Goal:** Provide "Book this train" button that deep links to SJ.se with the specific departure pre-selected

## Caching Strategy

### Cache Key Structure
`sj:{from}:{to}:{date}`
Example: `sj:stockholm-central:malmo-central:2025-12-21`

### Popular Routes (9x9 = 81 combinations)
- Pre-scraped every hour via cron
- Instant results for users from cache

### Unpopular Routes
- NOT pre-cached
- Scraped on-demand when user requests
- Show warning: "This may take 20-30 seconds"
- Results cached after first scrape (1 hour TTL)
- Subsequent requests for same route+date are instant

## Technical Considerations

### Memory/Performance
- Puppeteer uses ~500MB RAM per browser instance
- Expected low-medium traffic (< 10 concurrent users)
- 20-30 second wait time acceptable

### Scroll Implementation
- Use Puppeteer's auto-scroll pattern:
    - Scroll incrementally
    - Wait for new content to load
    - Repeat until no new content appears
    - Or scroll to element at bottom

### Error Handling Scenarios
- No trains available for date
- Sold out/unavailable prices
- Page structure changes
- Timeout (> 30 seconds)
- Network errors
- Infinite scroll fails to load all content

### Bot Detection Mitigation
- Add random delays between clicks (human-like)
- Smooth scrolling (not instant jumps)
- Consider user agent rotation if needed
- Rate limiting to protect target site

### Scraping Strategy Options
1. Single page context, navigate back after each click (fastest)
2. Open new browser context per option (cleaner but slower)
3. Reload page between options

**Recommendation:** Try option 1 first

## Security
- Protect `/api/update-cache` with secret token in Authorization header
- Token stored in environment variables

## Next Implementation Steps
1. Set up Nuxt 4 project, create simple ui
2. Install Puppeteer
3. **Inspect SJ.se for:**
    - Scroll behavior (lazy load trigger)
    - CSS selectors (departure list, price panels, availability)
    - Booking URL structure/identifiers
4. Implement scroll-to-bottom logic
5. Build scraping logic in `/api/scrape`
6. Extract/construct booking deep links
7. Implement caching layer
8. Create `/api/update-cache` endpoint
9. Set up external cron trigger
10. Build UI with loading states and "Book" buttons

## Deferred
- OpenAI API summarization (may not be needed, scraping provides all data)
