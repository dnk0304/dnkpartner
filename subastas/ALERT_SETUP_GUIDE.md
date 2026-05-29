# 🚀 Quick Setup Guide - Alert Email Notifications

## What You Need to Do Right Now

### Step 1: Get Your Resend API Key (2 minutes)

1. Go to https://resend.com/signup
2. Sign up with your email (dennis.kotlenko@gmail.com)
3. Verify your email
4. Go to **API Keys** section
5. Click **"Create API Key"**
6. Copy the key (starts with `re_`)

### Step 2: Update Your `.env` File

Open `c:\Users\D\Desktop\dnksubastas\.env` and replace the placeholder:

**Change this line:**
```
RESEND_API_KEY=re_123456789_PLACEHOLDER
```

**To your actual key:**
```
RESEND_API_KEY=re_your_actual_key_here
```

The rest is already configured:
```
RESEND_FROM_EMAIL=dennis.kotlenko@gmail.com
NEXT_PUBLIC_APP_URL=http://localhost:3005
```

### Step 3: Verify Your Email in Resend (For Sending)

Since you're using a personal email (dennis.kotlenko@gmail.com) as the sender:

1. In Resend Dashboard, go to **Domains**
2. Click **"Add Domain"** → Choose **"Verify individual email"**
3. Enter `dennis.kotlenko@gmail.com`
4. Click the verification link they send you
5. Once verified, you can send emails FROM this address

**Note:** For production, you'll set up your domain email instead.

### Step 4: Restart Your Dev Server

```bash
# Stop current server (Ctrl+C in terminal)
npm run dev
```

### Step 5: Test Alert Notifications

```bash
# Run the alert trigger script
node trigger-alerts.js
```

This will:
- Check all your active alerts
- Scan auctions from last 24 hours
- Send email notifications for matches
- Report results

---

## Understanding How It Works

### Your Alert System

1. **You create alerts** in the dashboard (province, municipality, category, price range, etc.)
2. **Auctions are scraped** daily and added to database
3. **Alert check runs** (manually now, will be automatic via cron later)
4. **Matching auctions** trigger email notifications

### Current Alert Configuration

The script `trigger-alerts.js` calls `/api/alerts/check` which:
- Loads all your active alerts from database
- Scans auctions from last 24 hours
- Matches them against your criteria
- Sends emails for matches

### Email Template

When you get an alert email, it will show:
- **Subject:** "Nuevas subastas para tu alerta: [Alert Name]"
- **Content:** List of matching auctions with:
  - Title
  - Location (province, municipality)
  - Price
  - Link to view auction

---

## Testing Scenarios

### Scenario 1: Test with Real Alerts

```bash
node trigger-alerts.js
```

Expected output if you have alerts:
```
✅ Alert check completed successfully!
├─ Alerts Checked: 1
├─ Auctions Scanned: 150
├─ Matches Found: 5
└─ Notifications Sent: 5
📧 Email notifications have been sent!
```

### Scenario 2: Quick Test Email

```bash
node test-email.js
```

This sends a test email with sample data to verify Resend works.

---

## Troubleshooting

### "RESEND_API_KEY not configured"
- Add your actual Resend API key to `.env`
- Restart dev server

### "No notifications sent"
- Check if your alerts have `emailEnabled = 1`
- Verify you have auctions in last 24 hours
- Check RESEND_API_KEY is correct

### "Email verification required"
- Verify dennis.kotlenko@gmail.com in Resend dashboard
- Check spam folder for verification email

### "No matches found"
- Normal if no new auctions match your criteria
- Try broader search criteria in your alerts
- Check database has auctions: `node check-db.js` (I'll create this)

---

## Next Steps After Testing

Once emails work:

1. **Set up cron job** to run `/api/alerts/check` every 15 minutes
2. **Configure domain email** when you have the domain
3. **Update `RESEND_FROM_EMAIL`** to use domain email
4. **Verify domain** in Resend for production

---

## Resend Free Tier

- ✅ **100 emails/day**
- ✅ **3,000 emails/month**
- ✅ Perfect for alerts
- ✅ No credit card needed

---

## Files I Created for You

1. `trigger-alerts.js` - Trigger alert checking system
2. `test-email.js` - Quick email test
3. `EMAIL_SETUP_INSTRUCTIONS.md` - Full setup guide (this file)

---

## Ready to Test?

```bash
# 1. Add your Resend API key to .env
# 2. Restart server: npm run dev
# 3. Run: node trigger-alerts.js
```

That's it! 🚀
