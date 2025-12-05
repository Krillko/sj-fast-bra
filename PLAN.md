# Project Summary: SJ.se Train Scraper with Nuxt 4

## Project Overview
Build a Nuxt 4 application that scrapes train schedules and prices from SJ.se (Swedish Railways) and displays them to users.

## Tech Stack Decisions

### Core Technologies
- **Framework:** Nuxt 4
- **Scraping Library:** Puppeteer (headless Chrome browser automation)
- **Caching:** Nitro built-in cache storage
- **Note:** Hosting concerns deferred - focus on functionality first

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
- External service calls it hourly (GitHub Actions, Cron-job.org, or other)
- Not real-time; users can wait 20-30 seconds for uncached routes

## Scraping Requirements

### Target Page Example
`https://www.sj.se/en/buy-trip/journey/Stockholm%20Central/Malmö%20Central/2025-12-21`

**Note:** Scraping English version of site (`/en/`) to keep all extracted data in English, matching our codebase language. Swedish is only used in our UI layer.

### Challenge
- **Two-page flow:** Clicking a departure navigates to a separate ticket selection page
- Departure cards on results page do NOT show prices
- **Page uses infinite scroll** - must scroll to bottom to load all departures before processing (confirmed: 7 cards initially, 14 after scroll)
- Must navigate back and forth between results and ticket pages
- Each departure requires separate page navigation (14 departures = 14 navigations)

### Scraping Flow
1. Navigate to search results page: `/search-journey/choose-journey/{from}/{to}/{date}`
2. **Scroll to bottom** to trigger loading of all departures (lazy loading confirmed)
3. Wait for all content to load
4. Get list of all departure cards (use UUID data-testid selector)
5. For each departure card:
   - Extract times, duration, changes from card HTML
   - Click card to navigate to ticket selection page: `/choose-ticket-type/{from}/{to}/{date}/outward-journey`
   - Extract prices for 3 classes using data-testid selectors (SECOND-price, SECOND_CALM-price, FIRST-price)
   - Navigate back to results page
   - Wait for page to stabilize
6. Compile all data into JSON

### Data to Extract (per departure)
- Departure time
- Arrival time
- Duration (total travel time)
- Number of changes/transfers (0 = direct train)
- 3 price tiers (2nd class, 2nd class calm, First class)
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
      "changes": 0,
      "prices": {
        "secondClass": { "price": 195, "available": true },
        "secondClassCalm": { "price": 395, "available": true },
        "firstClass": { "price": 595, "available": false }
      },
      "bookingUrl": "https://www.sj.se/...[deep link to this specific departure]"
    }
  ]
}
```

## Booking Deep Links

### Strategy (Updated based on findings)

**Discovered URL pattern:**
```
https://www.sj.se/en/search-journey/choose-ticket-type/{from}/{to}/{date}/outward-journey
```

**Current Status:**
- This URL leads to ticket selection page (choose between 2nd class, 2nd class calm, 1st class)
- Does NOT pre-select a specific departure time
- All departures for the same route/date share the same ticket selection URL

**Options for implementation:**

- **Option A (Current):** Link to ticket selection page
  - URL: `/choose-ticket-type/{from}/{to}/{date}/outward-journey`
  - User selects ticket class after clicking
  - ⚠️ Does not pre-select the specific departure the user chose

- **Option B (Investigate further):** Test URL parameters
  - Check if URL can include departure time parameter to pre-select
  - Example: `...?departureTime=12:00` or similar
  - Requires additional testing

- **Option C (Fallback):** Link to search results page
  - URL: `/search-journey/choose-journey/{from}/{to}/{date}`
  - User must find and click their train again
  - Poor UX but functional

**Goal:** Provide "Book this train" button. Currently using Option A (ticket selection page URL) until we can test if departure time can be pre-selected via URL parameters.

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

## Implementation Steps

### 1. Set up Nuxt 4 project and create UI

#### Install Nuxt UI
- Add `@nuxt/ui` module to the project
- Configure Nuxt UI in `nuxt.config.ts`

#### Internationalization (i18n)
- **Initial language:** Swedish only for UI text
- **Architecture:** Prepare for multi-language support (use i18n structure from start)
- **Code & Documentation:** All code, comments, and documentation in English
- Consider using `@nuxtjs/i18n` module for future language expansion

#### Create Start Page (Catch-all route)
- Main page with simple search interface
- Clean, minimal design using Nuxt UI components

#### Design Philosophy
- **Desktop-first approach:** SJ.se provides poor desktop experience (requires clicking back and forth)
- **Our advantage:** Display all departure information in one comprehensive table
- No need to click individual items to see prices and details
- Optimize for wide screens and data density

#### UI Components Needed:
1. **Logo Placeholder**
   - Very wide logo area (aspect ratio ~5:1)
   - Positioned at top of page
   - Placeholder for future branding

2. **Light/Dark Mode Toggle**
   - Button to switch between light and dark themes
   - Persist user preference (localStorage)
   - Use Nuxt UI's built-in theme system

3. **City Selectors (2 instances)**
   - Populate with 20 most populated Swedish cities/towns
   - Sorted by population (largest to smallest)
   - One selector for "From" location
   - One selector for "To" location

4. **Date Selector**
   - Standard date picker component
   - Default to today's date

5. **Direct Trains Filter**
   - Checkbox: "Only direct trains" (Endast direkta tåg)
   - When checked, filters results to show only journeys without changes
   - Applied after scraping (client-side filter)

6. **Go Button**
   - Submits the search form

#### Cities List (20 most populated Swedish cities)
```
1. Stockholm
2. Göteborg (Gothenburg)
3. Malmö
4. Uppsala
5. Sollentuna
6. Västerås
7. Örebro
8. Linköping
9. Helsingborg
10. Jönköping
11. Norrköping
12. Lund
13. Umeå
14. Gävle
15. Borås
16. Eskilstuna
17. Södertälje
18. Karlstad
19. Täby
20. Växjö
```

#### Validation Rules:
- **Date validation:** Must be today or in the future (no past dates)
- **City validation:** "From" and "To" cities must be different

#### Navigation Pattern:
- On "Go" button click: Navigate to `/{date}/{to}/{from}`
- Example: `/2025-12-21/malmo/stockholm`
- Use URL-friendly slugs (lowercase, hyphens for spaces)

#### URL Slug Mapping:
- Cities with spaces: Convert to lowercase with hyphens
  - "Stockholm Central" → "stockholm-central"
  - "Malmö Central" → "malmo-central"

#### Results Display (after scraping)
- **One comprehensive table** showing all departures with all details
- **Table columns:**
  - Departure time
  - Arrival time
  - Duration
  - Number of changes/transfers
  - 2nd class price
  - 2nd class calm price
  - First class price
  - Booking link/button
- **No clicking required** - all information visible at once
- **Sortable columns** (time, price, duration)
- **Filter controls** - apply "direct trains only" filter if checkbox is checked

### 2. Install Puppeteer
- Run `npm install puppeteer`
- Test basic functionality

### 3. Inspect SJ.se English site for:
- Target: `https://www.sj.se/en/buy-trip/journey/...`
- Scroll behavior (lazy load trigger)
- CSS selectors (departure list, price panels, availability)
- Booking URL structure/identifiers
- Verify English site has same functionality as Swedish version

### 4. Implement scroll-to-bottom logic
- Create reusable scroll utility
- Handle lazy loading of departure list

### 5. Build scraping logic in `/api/scrape`
- Implement main scraping flow
- Extract departure data and prices

### 6. Extract/construct booking deep links and journey details
- **Extract journey information:**
  - Total travel time (duration)
  - Number of changes/transfers (0 for direct trains)
- **Extract/construct booking links:**
  - Investigate and implement best linking strategy
  - Provide direct booking URLs per departure

### 6.5. Create results page UI
- **Dynamic route:** `app/pages/[date]/[from]/[to].vue`
- **Loading state:**
  - Show loading spinner/skeleton
  - Display message: "This might take up to 30 seconds"
  - Fetch data from `/api/scrape` with long timeout (no client-side timeout)
- **Toggle switch:**
  - "Direct connections only" vs "All trains"
  - Client-side filtering of results
- **Results table:**
  - Display all departures in comprehensive table
  - Columns: Departure, Arrival, Duration, Changes, 2nd class, 2nd class calm, 1st class, Book button
  - Show price or "Unavailable" for each class
- **No direct connections:**
  - Detect if no departures have `changes: 0`
  - Show message: "Inga direkta tåg finns. Visar alla resor." (No direct trains available. Showing all journeys.)
- **Test case:** Uppsala Central → Göteborg Central (no direct connections)

### 7. Implement caching layer
- Use Nitro storage for cache
- Implement cache key structure: `sj:{from}:{to}:{date}`
- Set 1-hour TTL

### 8. Create `/api/update-cache` endpoint
- Protected with Authorization header
- Pre-scrapes popular routes
- Called hourly by external cron

### 9. Set up external cron trigger
- Configure external service (GitHub Actions, Cron-job.org, etc.)
- Schedule hourly calls to `/api/update-cache`


## Deferred
- OpenAI API summarization (may not be needed, scraping provides all data)
