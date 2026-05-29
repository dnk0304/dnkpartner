# SubastaPro Python Scraper

## Setup

1. Create virtual environment:
```bash
python -m venv venv
```

2. Activate virtual environment:
```bash
# Windows
.\venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Install Playwright browsers:
```bash
playwright install chromium
```

5. Install Tesseract OCR (for TEJU PDF extraction):
- **Windows**: Download from https://github.com/UB-Mannheim/tesseract/wiki
- **Linux**: `sudo apt-get install tesseract-ocr tesseract-ocr-spa`
- **Mac**: `brew install tesseract tesseract-lang`

## Running the Scraper

### Manual Execution

```bash
# Run specific scraper
python main.py discovery  # BOE discovery
python main.py pulse      # Update active auctions
python main.py urgent     # Check urgent auctions
python main.py teju       # Scan TEJU pre-auctions

# Run all scrapers
python main.py all
```

### Celery Worker (Background Processing)

1. Start Redis (required):
```bash
docker compose up -d redis
```

2. Start Celery worker:
```bash
celery -A tasks worker --loglevel=info
```

3. Start Celery beat (scheduler):
```bash
celery -A tasks beat --loglevel=info
```

## Task Schedules

| Task | Frequency | Description |
|------|-----------|-------------|
| `discovery_sync` | Every 6 hours | Find new auctions on BOE |
| `pulse_check` | Every 30 minutes | Update bids for active auctions |
| `urgent_pulse` | Every 15 minutes | Monitor auctions ending soon |
| `teju_scan` | Daily at 08:00 | Scan TEJU for pre-auctions |

## Architecture

```
scraper/
├── requirements.txt      # Python dependencies
├── celeryconfig.py       # Celery configuration & schedules
├── tasks.py              # Celery task definitions
├── db.py                 # Database connection & queries
├── boe_scraper.py        # BOE scraper (Discovery + Pulse)
├── teju_scraper.py       # TEJU scraper with OCR
├── main.py               # Manual runner entry point
└── temp_pdfs/            # Temporary PDF storage
```

## Environment Variables

Create `.env` file:
```env
DATABASE_URL=postgresql://subastapro:subastapro_dev_password@localhost:5432/subastapro
REDIS_URL=redis://localhost:6379/0
```

## Notes

- The BOE scraper uses Playwright for browser automation
- TEJU scraper downloads PDFs and uses Tesseract OCR for text extraction
- All scrapers connect directly to Postgres (not through Prisma)
- Tasks are idempotent - running multiple times won't create duplicates
