# SubastaPro Handoff Workflow (Sonnet)

This workflow is a step-by-step guide to finish wiring bank scrapers, validate TEJU ingestion, and verify UI behavior.

## 1) Bank API probe (capture real endpoints)

Run the probe:

```
python scripts/bank_api_probe.py
```

Output log:

```
scraper/logs/bank_api_probe_*.log
```

Extract endpoints and request shapes (URL, method, JSON body, headers) from XHR/JSON lines. The latest probe captured:

- Solvia search: `https://www.solvia.es/api/inmuebles/v2/buscarInmuebles` (POST)
- Altamira content: `https://www.altamirainmuebles.com/nodejs/index` (POST)

If a bank is missing, open the site, perform a search/filter, and re-run the probe to capture real search requests.

## 2) Wire bank scrapers to real endpoints

Update per-bank scrapers:

- `scraper/scrapers/servihabitat_scraper.py`
- `scraper/scrapers/haya_scraper.py`
- `scraper/scrapers/altamira_scraper.py`
- `scraper/scrapers/solvia_scraper.py`
- `scraper/scrapers/anticipa_scraper.py`
- `scraper/scrapers/aliseda_scraper.py`

Use environment overrides for endpoints to avoid hard-coding:

```
SERVIHABITAT_API_BASE
SERVIHABITAT_SEARCH_ENDPOINT
HAYA_API_BASE
HAYA_SEARCH_ENDPOINT
ALTAMIRA_API_BASE
ALTAMIRA_SEARCH_ENDPOINT
SOLVIA_API_BASE
SOLVIA_SEARCH_ENDPOINT
ANTICIPA_API_BASE
ANTICIPA_SEARCH_ENDPOINT
ALISEDA_API_BASE
ALISEDA_SEARCH_ENDPOINT
```

Test scrape:

```
python -c "from scraper.tasks.bank_tasks import discover_all_banks; print(discover_all_banks())"
```

Success: at least 1 item saved per bank, or a clear error in logs (blocked/403/429).

## 3) TEJU scrape + scheduler

Run TEJU:

```
python -m scraper.main_new teju
```

Expected: zero or more pre-auction leads saved (depending on availability).

Start scheduler:

```
python scraper/scheduler.py
```

Confirm updates:

```
python scripts/check_db_stats.py
```

## 4) UI validation vs competitors

Compare:

- `https://subastas.io`
- `https://alertasubastas.com`
- `http://localhost:3005` (or production domain)

Capture screenshots of:

- Search/filter UI
- Province/municipality navigation
- Auction detail page
- Status toggle behavior

Summarize gaps and prioritize 3–5 improvements.

## 5) Rollback steps

- If bank scrapers fail, revert endpoints to previous defaults or disable their scheduler entry.
- If TEJU fails, keep it in scheduled runs but log “0 results.”
- If scheduler errors, run `python scraper/scheduler.py --once --mode active` for a single cycle.

## Notes

- Bank portals often require additional headers or cookies. Capture those in the probe logs.
- Some portals use Cloudflare; you may need proxy rotation and slower cadence.
