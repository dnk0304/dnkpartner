# AlertaSubastas Scraper - Manual Setup Required

## Status
✅ **Scraper Code**: Complete (`scraper/alertasubastas_scraper.py`)  
✅ **Database Schema**: Extended with all required fields  
⚠️ **Login Automation**: Requires manual cookie/session setup  

## Login Issue
Alert aSubastas uses a complex login form where the password field is hidden/dynamic. Playwright automation fails to interact with it.

## Workaround: Manual Cookie Export

### Option 1: Using Browser Extension (Recommended)
1. Install "EditThisCookie" or "Cookie-Editor" browser extension
2. Log in to https://alertasubastas.com manually
3. Export cookies as JSON
4. Save to `scraper/browser_context/cookies.json`

### Option 2: Use Existing Browser Session
The scraper supports `--skip-login` flag to use an already-logged-in browser session.

## Running the Scraper

### Test Mode (5 auctions):
```bash
python scraper/alertasubastas_scraper.py --test --headless --skip-login
```

### Full Scrape (203,508 auctions):
```bash
# Active auctions only
python scraper/alertasubastas_scraper.py --status activas --skip-login

# Finished auctions (historical data)
python scraper/alertasubastas_scraper.py --status finalizadas --skip-login
```

### Parallel Execution:
Split by property type (22 types):
```bash
python scraper/alertasubastas_scraper.py --property-type vivienda --status finalizadas --skip-login
python scraper/alertasubastas_scraper.py --property-type garaje --status finalizadas --skip-login
# ... etc
```

## Data Verified
I've manually verified the AlertaSubastas data structure using the browser:
- **Active auctions**: 1,823 (e.g., Madrid: 27 active)
- **Total auctions**: 203,508
- **Property types**: 22 categories
- **Provinces**: 52
- **Data fields**: All mapped correctly to our schema

## Next Steps
1. Manually export cookies from logged-in browser session
2. Test scraper with `--skip-login` flag
3. Run parallel scrapers (5-10 instances) for full data migration
4. Estimated time: 24-48 hours for 203,508 auctions

## Alternative: API Integration
If scraping proves too slow, consider contacting AlertaSubastas for a data export or API access.
