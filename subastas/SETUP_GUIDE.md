# Quick Setup Guide - New Features

This guide will help you get all 5 new features running.

## 1. Install Dependencies

### Frontend (Next.js)
```bash
npm install
```

This will install the new `stripe` package (v17.5.0) added to package.json.

### Backend (Python Scrapers)
```bash
cd scraper
pip install -r requirements.txt
```

This installs the new `playwright-stealth` package for anti-bot measures.

---

## 2. Update Database Schema

The Prisma schema has been updated with a new `Subscription` model.

```bash
npx prisma db push
```

This creates the `Subscription` table in your SQLite database.

---

## 3. Environment Variables

Create/update your `.env` file in the project root:

```bash
# Database (already configured)
DATABASE_URL="file:./prisma/dev.db"

# Stripe (required for subscriptions)
STRIPE_SECRET_KEY="sk_test_..." # Get from Stripe Dashboard
STRIPE_WEBHOOK_SECRET="whsec_..." # Get after setting up webhook
STRIPE_GOLD_MONTHLY_PRICE_ID="price_..." # Create in Stripe Dashboard
STRIPE_GOLD_ANNUAL_PRICE_ID="price_..."
STRIPE_DIAMOND_MONTHLY_PRICE_ID="price_..."
STRIPE_DIAMOND_ANNUAL_PRICE_ID="price_..."

# Optional: For production notifications
SENDGRID_API_KEY="" # Email provider
TWILIO_ACCOUNT_SID="" # SMS provider
TWILIO_AUTH_TOKEN=""
TWILIO_PHONE_NUMBER=""

# App URL (for email links)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Create/update `scraper/.env`:

```bash
# Proxy Configuration (optional, for production scraping)
PROXY_PROVIDER=none  # or 'brightdata' or 'zenrows'
BRIGHTDATA_USERNAME=
BRIGHTDATA_PASSWORD=
BRIGHTDATA_HOST=brd.superproxy.io:22225
ZENROWS_API_KEY=

# Database
DATABASE_URL=file:./prisma/dev.db

# Redis (for Celery)
REDIS_URL=redis://localhost:6379/0
```

---

## 4. Set Up Stripe (Development)

### Create Stripe Account
1. Go to https://stripe.com
2. Sign up for a free account
3. Switch to "Test mode" (toggle in top right)

### Create Products and Prices
In Stripe Dashboard → Products:

1. **Gold Monthly**
   - Name: "Gold Monthly"
   - Price: €29/month
   - Copy the Price ID (starts with `price_`)

2. **Gold Annual**
   - Name: "Gold Annual"
   - Price: €290/year
   - Copy the Price ID

3. **Diamond Monthly**
   - Name: "Diamond Monthly"
   - Price: €79/month
   - Copy the Price ID

4. **Diamond Annual**
   - Name: "Diamond Annual"
   - Price: €790/year
   - Copy the Price ID

Add these Price IDs to your `.env` file.

### Set Up Webhook (Local Testing)
```bash
# Install Stripe CLI
# Windows: scoop install stripe
# Mac: brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook signing secret (starts with `whsec_`) to your `.env` as `STRIPE_WEBHOOK_SECRET`.

---

## 5. Start the Application

```bash
npm run dev
```

The app will start on http://localhost:3000

---

## 6. Test the Features

### Test 1: Diamond Dashboard
1. Navigate to http://localhost:3000/diamond
2. You should see:
   - Pre-auction pipeline with 3 mock items
   - Status badges (En Tramitación, Pendiente BOE, Anunciada)
   - Cargas anteriores and preferentes
   - Occupancy status
   - Stats cards at the top

### Test 2: Alert System
1. Navigate to http://localhost:3000/alerts
2. Create a new alert:
   - Name: "Test Alert"
   - Province: "Las Palmas"
   - Category: "Viviendas"
   - Max Price: 300000
   - Enable Email
3. The alert should appear in the list
4. Test the API: `curl http://localhost:3000/api/alerts/check -X POST`

### Test 3: Stripe Checkout
1. On the main dashboard, click any "Upgrade" button
2. The UpgradeModal should show:
   - Gold and Diamond plans
   - Monthly/Annual toggle
   - Trial period badges
3. Click "Comenzar Prueba Gratis" on Gold
4. You should be redirected to Stripe Checkout
5. Use test card: `4242 4242 4242 4242`, any future date, any CVC
6. Complete payment
7. You should be redirected to `/subscription/success`

### Test 4: Admin Dashboard
1. Navigate to http://localhost:3000/admin
2. You should see:
   - 4 overview cards (System Status, Database, API, Users)
   - Tabs: Scrapers, API, Database, Notifications
   - Auto-refresh every 30 seconds
3. Click "Actualizar" to manually refresh
4. Check each tab to see different system metrics

### Test 5: Proxy/Stealth Scrapers
```bash
cd scraper
python boe_scraper.py  # Should run with stealth measures
python teju_scraper.py  # Should use anti-bot detection
```

The scrapers now include:
- Random user agents
- Fingerprint spoofing
- Human-like delays
- Optional proxy rotation

---

## 7. Production Checklist

Before deploying to production:

- [ ] Set up real Stripe products (not test mode)
- [ ] Configure Stripe webhook endpoint in Stripe Dashboard
- [ ] Set up SendGrid for emails
- [ ] Set up Twilio for SMS
- [ ] Configure proxy service (Bright Data or ZenRows)
- [ ] Set up cron jobs for scrapers:
  - BOE Discovery: `0 */6 * * *` (every 6 hours)
  - BOE Pulse: `*/15 * * * *` (every 15 minutes)
  - TEJU Scanner: `0 */12 * * *` (every 12 hours)
  - Alert Checker: `*/15 * * * *` (every 15 minutes)
- [ ] Migrate from SQLite to PostgreSQL (Supabase/Railway)
- [ ] Set up proper authentication (NextAuth.js)
- [ ] Add rate limiting to API routes
- [ ] Set up Sentry for error tracking
- [ ] Configure CORS for production domain

---

## Troubleshooting

### "Module not found: stripe"
Run `npm install` again to install the Stripe package.

### "Table 'Subscription' does not exist"
Run `npx prisma db push` to create the new table.

### Stripe webhook not working
Make sure `stripe listen` is running in a separate terminal.

### Scrapers failing
Check that `playwright-stealth` is installed: `pip list | grep playwright-stealth`

### API errors
Check the browser console and terminal logs for detailed error messages.

---

## Support

If you encounter issues:
1. Check the `IMPLEMENTATION_COMPLETE.md` for detailed documentation
2. Review the inline comments in each file
3. Check the browser console for frontend errors
4. Check the terminal for backend errors

All features are ready to use! 🚀
