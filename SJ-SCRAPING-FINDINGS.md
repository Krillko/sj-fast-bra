# SJ.se Scraping Implementation Findings

## Overview
This document contains detailed findings from analyzing the SJ.se website structure to inform our Puppeteer scraping implementation.

**Date:** 2025-12-05
**Site Version:** English version (`https://www.sj.se/en/`)
**Test Route:** Stockholm Central → Malmö Central

---

## Key Discovery: Two-Page Flow

**IMPORTANT:** Clicking on a departure card does NOT reveal prices on the same page. Instead, it navigates to a separate ticket selection page.

### Page Flow:
1. **Search Results Page:** `/search-journey/choose-journey/{from}/{to}/{date}`
   - Shows departure cards with times, duration, changes
   - NO price information visible

2. **Ticket Selection Page:** `/choose-ticket-type/{from}/{to}/{date}/outward-journey`
   - Shows 3 ticket classes with prices
   - Shows benefits for each class
   - User selects ticket type here

---

## Lazy Loading Confirmed

**Test Results:**
- Initial card count: 7 departures
- After scrolling to bottom: 14 departures
- **Conclusion:** YES, lazy loading is used

### Scroll Implementation Required:
```javascript
// Scroll incrementally until no new content loads
await page.evaluate(async () => {
  await new Promise((resolve) => {
    let lastHeight = document.body.scrollHeight;
    const scrollInterval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        clearInterval(scrollInterval);
        resolve();
      }
      lastHeight = newHeight;
    }, 500);
  });
});
```

---

## Search Results Page Selectors

### URL Pattern
```
https://www.sj.se/en/search-journey/choose-journey/{from}/{to}/{date}
```
Example: `https://www.sj.se/en/search-journey/choose-journey/Stockholm%20Central/Malmö%20Central/2025-12-05`

### Departure Cards

**Card Selector:**
```javascript
const cards = document.querySelectorAll('[data-testid*="-"]');
const departureCards = Array.from(cards).filter((card) => {
  const testId = card.getAttribute('data-testid');
  return testId && testId.match(/^[0-9a-f-]{36}$/); // UUID format
});
```

**Example card data-testid:** `"2eda0481-2800-3aa3-b548-2b66fd3cf06c"`

### Data Extraction from Cards

**Visible Data (WITHOUT clicking):**

1. **Times** (departure and arrival)
   - Pattern: Look for `\d{2}:\d{2}` in card HTML
   - Example: `["12:00", "18:56"]`

2. **Duration**
   - Pattern: `(\d+\s*h\s*\d+\s*min|\d+\s*h|\d+\s*min)`
   - Example: `"6 h"`, `"4 h 30 min"`

3. **Changes**
   - Pattern: `(Direct|\d+\s*change)`
   - Example: `"0 change"`, `"1 change"`, `"Direct"`
   - Note: "0 change" means direct train

4. **Has Clickable Element**
   - Each card has a clickable button/area
   - Clicking navigates to ticket selection page

**Data NOT Available on Cards:**
- Prices (must navigate to ticket selection page)
- Availability (must navigate to ticket selection page)

---

## Ticket Selection Page Selectors

### URL Pattern
```
https://www.sj.se/en/search-journey/choose-ticket-type/{from}/{to}/{date}/outward-journey
```

### Ticket Class Cards

Three ticket classes available:

#### 1. 2nd Class (SECOND)
- **data-testid:** `"SECOND"`
- **Input selector:** `[data-testid="SECOND-Input"]`
- **Price selector:** `[data-testid="SECOND-price"]`
- **Status:** May show "Unavailable" when sold out

#### 2. 2nd Class Calm (SECOND_CALM)
- **data-testid:** `"SECOND_CALM"`
- **Input selector:** `[data-testid="SECOND_CALM-Input"]`
- **Price selector:** `[data-testid="SECOND_CALM-price"]`
- **Example price:** `"Fr. 1,935 SEK"` (formatted as: "from 1,935 Swedish kronor")

#### 3. 1st Class (FIRST)
- **data-testid:** `"FIRST"`
- **Input selector:** `[data-testid="FIRST-Input"]`
- **Price selector:** `[data-testid="FIRST-price"]`
- **Example price:** `"Fr. 2,105 SEK"`

### Price Format

**HTML Structure:**
```html
<span class="MuiBox-root css-l704s7" data-testid="SECOND_CALM-price">
  <div class="MuiBox-root css-1l0di4j">
    <span class="MuiTypography-root MuiTypography-body1 css-q8q8m" aria-hidden="true">Fr. </span>
    <span class="MuiBox-root css-0">
      <span class="MuiTypography-root MuiTypography-h3 css-16tjjpi" aria-hidden="true">1,935</span>
      <span class="MuiTypography-root MuiTypography-h3 css-yif0nq" aria-hidden="true"> SEK</span>
    </span>
  </div>
  <span class="MuiTypography-root MuiTypography-srOnly css-dsivff">from 1,935 Swedish kronor</span>
</span>
```

**Extraction Strategy:**
- Use `data-testid="SECOND_CALM-price"` selector
- Extract text content and parse number: `1,935` → `1935`
- Note: Comma is thousands separator (Swedish format)

### Unavailable Tickets

**HTML Structure:**
```html
<span class="MuiTypography-root MuiTypography-body1 css-18un141">Unavailable</span>
```

**Detection:**
- Look for "Unavailable" text
- OR check if button is disabled: `button.Mui-disabled`

### Benefits Section

Each ticket class shows benefits (not needed for scraping but useful context):
- 2nd Class: Seat reservation included
- 2nd Class Calm: + Low speech volume, Free coffee/tea
- 1st Class: + Extra legroom, Coffee/tea/fruit in carriage, Pre-ordered food

---

## Navigation Between Pages

### Back Button
Located in top navigation bar:
```html
<a href="/en/search-journey/choose-journey/Stockholm%20Central/Malm%C3%B6%20Central/2025-12-05"
   aria-label="Back to choose journey">
  Choose journey
</a>
```

**Strategy:** Use browser back navigation instead:
```javascript
await page.goBack();
```

---

## Scraping Strategy

### Recommended Approach

1. **Navigate to results page**
2. **Scroll to bottom** to load all departure cards
3. **Get list of all departure cards**
4. **For each departure card:**
   a. Extract times, duration, changes from card HTML
   b. Click the card to navigate to ticket selection page
   c. Extract prices for all 3 classes (or "unavailable")
   d. Navigate back to results page
   e. Wait for page to reload
5. **Compile all data into JSON**

### Alternative Approach (if back navigation is unreliable)

1. **Get all departure card URLs first** (if extractable)
2. **For each URL:**
   a. Navigate directly to ticket selection page
   b. Extract data
   c. Navigate back to results page
3. **Match extracted data with departure times**

### Performance Considerations

- **14 departures** = 14 page navigations
- Estimated time: 20-30 seconds total (as planned)
- Add random delays between clicks (100-300ms) for human-like behavior

---

## Cookie Consent

**Must be handled on first page load:**

```javascript
await page.waitForFunction(
  () => Array.from(document.querySelectorAll('button'))
    .find((btn) => btn.textContent.includes('Accept all cookies')),
  { timeout: 5000 },
);
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.includes('Accept all cookies'));
  if (btn) btn.click();
});
```

---

## Example Scraped Data Structure

```json
{
  "route": "Stockholm Central → Malmö Central",
  "date": "2025-12-05",
  "scrapedAt": "2025-12-05T10:30:00Z",
  "departures": [
    {
      "departureTime": "12:00",
      "arrivalTime": "18:56",
      "duration": "6 h",
      "changes": 1,
      "prices": {
        "secondClass": { "price": null, "available": false },
        "secondClassCalm": { "price": 1935, "available": true },
        "firstClass": { "price": 2105, "available": true }
      },
      "bookingUrl": "https://www.sj.se/en/search-journey/choose-ticket-type/Stockholm%20Central/Malmö%20Central/2025-12-05/outward-journey"
    },
    {
      "departureTime": "12:25",
      "arrivalTime": "16:52",
      "duration": "4 h",
      "changes": 0,
      "prices": {
        "secondClass": { "price": 295, "available": true },
        "secondClassCalm": { "price": 495, "available": true },
        "firstClass": { "price": 695, "available": true }
      },
      "bookingUrl": "https://www.sj.se/en/search-journey/choose-ticket-type/Stockholm%20Central/Malmö%20Central/2025-12-05/outward-journey"
    }
  ]
}
```

---

## Error Handling Scenarios

1. **No departures found**
   - Check if page shows "No trains available" message
   - Return empty departures array

2. **All tickets sold out**
   - All 3 classes show "Unavailable"
   - Store prices as `null` with `available: false`

3. **Page structure changed**
   - Log error with screenshot
   - Return error response

4. **Timeout**
   - Set reasonable timeout (30 seconds total)
   - Return partial data if some departures scraped

5. **Scroll fails**
   - Implement fallback: click "Load more" button if exists
   - Or accept limited results (first 7 cards)

---

## Bot Detection Mitigation

**Implemented in exploration script:**
- `slowMo: 50` - Slows down Puppeteer operations
- Random delays between actions
- Accept cookies to appear as normal user

**Additional recommendations:**
- Vary scroll speed (not instant jumps)
- Random delay between departure clicks (100-300ms)
- Set realistic viewport size (1920x1080)
- Use default user agent (no need to change)

---

## Booking Deep Links

### URL Structure
After analyzing the flow, booking URLs follow this pattern:

```
https://www.sj.se/en/search-journey/choose-ticket-type/{from}/{to}/{date}/outward-journey
```

**Important:** This URL leads to the ticket selection page, not directly to checkout.

**Options for "Book" button:**

1. **Direct to ticket selection page** (recommended)
   - URL: `/choose-ticket-type/{from}/{to}/{date}/outward-journey`
   - User selects ticket class
   - Best UX: Pre-selects the specific departure time

2. **Back to search results**
   - URL: `/choose-journey/{from}/{to}/{date}`
   - Less ideal: User must find their train again

3. **Investigate further:** Can we pre-select a specific departure?
   - Check if URL parameters exist for departure time
   - Check if we can extract a unique journey ID

**Next Step:** Test if ticket selection URL can include departure time parameter

---

## Next Implementation Steps

1. ✅ Create Puppeteer inspection script
2. ✅ Navigate to SJ.se and capture initial state
3. ✅ Interact with search form and submit
4. ✅ Analyze results page structure and selectors
5. ✅ Test scroll behavior for lazy loading
6. ✅ Document findings for scraping implementation
7. **Next:** Implement scroll-to-bottom logic (PLAN.md Step 4)
8. **Next:** Build scraping logic in `/api/scrape` (PLAN.md Step 5)
9. **Next:** Extract/construct booking deep links (PLAN.md Step 6)

---

## Files Generated During Exploration

- `screenshots/01-homepage.png` - Initial SJ.se homepage
- `screenshots/02-search-modal.png` - Search form modal
- `screenshots/03-form-filled.png` - Form with Stockholm → Malmö filled
- `screenshots/04-results-page.png` - Search results (departure list)
- `screenshots/05-before-click.png` - Results page before clicking card
- `screenshots/06-after-click.png` - Ticket selection page after clicking
- `screenshots/search-modal.html` - HTML of search modal
- `screenshots/results-page.html` - HTML of results page (large file)
- `screenshots/after-click.html` - HTML of ticket selection page

---

## Summary

**Major architectural change needed:**
- Original PLAN.md assumed: Click card → prices revealed on same page
- **Reality:** Click card → navigate to new page → extract prices → navigate back

**This affects:**
- Scraping complexity (14 departures = 14 page navigations)
- Time estimates (still acceptable at 20-30 seconds)
- Error handling (navigation failures)
- Caching strategy (unchanged)

**Confirmed:**
- Lazy loading exists (7 → 14 cards after scroll)
- Price tiers: "2nd class", "2nd class calm", "1st class" ✓
- Data-testid selectors are reliable
- English site works perfectly for our needs
