# ⚠️ Email Configuration Required

## The Issue

Your email testing endpoint is working correctly, but **RESEND_API_KEY is not configured** in your environment variables.

## What You Need to Do

### Step 1: Get a Resend API Key (Free)

1. Go to https://resend.com/signup
2. Sign up for a free account (no credit card required)
3. Verify your email address
4. Go to **API Keys** section
5. Click "Create API Key"
6. Copy the API key (starts with `re_`)

### Step 2: Configure Your Environment

Add these lines to your `.env` file:

```bash
# Email Configuration
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=SubastaPro <notifications@subastapro.com>
NEXT_PUBLIC_APP_URL=http://localhost:3005
```

**Note:** Replace `re_your_actual_api_key_here` with your actual Resend API key!

### Step 3: Verify Domain (For Production)

For production emails, you need to verify your domain in Resend:
1. Go to Resend Dashboard → Domains
2. Add your domain
3. Add DNS records they provide

For testing, you can use the **sandbox domain** that Resend provides (only sends to verified email addresses).

### Step 4: Restart Your Dev Server

After adding the environment variables:

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm run dev
```

### Step 5: Test the Email

Once configured, run:

```bash
node test-email.js
```

Or use the API directly:

```bash
curl -X POST http://localhost:3005/api/alerts/test \
  -H "Content-Type: application/json" \
  -d '{"email": "dennis.kotlenko@gmail.com"}'
```

---

## Quick Check

Run this to see if it's configured:

```bash
node test-email.js
```

You should see:
```
✅ SUCCESS! Email sent!
```

---

## Resend Free Tier

- **100 emails/day** for free
- **3,000 emails/month** for free
- Perfect for testing and development
- No credit card required

---

## Alternative: Use Existing SMTP

If you already have an SMTP server, you can modify the code to use nodemailer instead of Resend. Let me know if you need help with that!

---

## Status Check

Run the test script I created:

```bash
node test-email.js
```

Current status: **❌ RESEND_API_KEY not configured**

After you add the key: **✅ Should work!**
