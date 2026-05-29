# Quick Testing Guide

## 🧪 Test Email Notifications

### Quick Test Command (PowerShell)
```powershell
Invoke-WebRequest -Uri "http://localhost:3005/api/alerts/test" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "dennis.kotlenko@gmail.com"}'
```

### Quick Test Command (Bash/WSL)
```bash
curl -X POST http://localhost:3005/api/alerts/test \
  -H "Content-Type: application/json" \
  -d '{"email": "dennis.kotlenko@gmail.com"}'
```

### Check Configuration
Open in browser: http://localhost:3005/api/alerts/test

---

## 🗺️ Test Map Improvements

1. **Start Dev Server**
   ```bash
   npm run dev
   ```

2. **Open Dashboard**
   - Visit: http://localhost:3005

3. **Test Map Features**
   - ✅ Province markers show correct counts
   - ✅ Click province → See municipalities
   - ✅ Click municipality → See individual auctions
   - ✅ All auctions with coordinates visible

---

## 📋 Checklist

- [ ] Dev server running (`npm run dev`)
- [ ] Email test endpoint works (check `/api/alerts/test`)
- [ ] Test email received at dennis.kotlenko@gmail.com
- [ ] Map shows all auctions (not just 50)
- [ ] Map tiles look better (Stadia Maps upgrade)
- [ ] Auction cards show map images when coordinates exist

---

## 🐛 Quick Debug

### Email Not Working?
```bash
# Check environment variables
cat .env.local | grep RESEND
```
Should show:
- `RESEND_API_KEY=re_xxxxx`
- `RESEND_FROM_EMAIL=SubastaPro <notifications@subastapro.com>`

### Map Not Showing Auctions?
Open browser console (F12) and check:
1. Network tab → `/api/auctions/map` returns data
2. Console → No JavaScript errors
3. Database → Auctions have coordinates

---

## 📊 What Changed?

| Feature | Before | After |
|---------|--------|-------|
| **Email Testing** | Manual testing only | `/api/alerts/test` endpoint |
| **Map Data** | Paginated (50 items) | ALL auctions with coordinates |
| **Map Quality** | CartoDB basic | Stadia Maps (better quality) |
| **Static Maps** | OSM basic | Stadia Maps @2x retina |

---

## 🎯 Success Criteria

✅ Can send test email via API
✅ Test email arrives in inbox
✅ Map shows accurate province counts
✅ Map displays all auctions with coordinates
✅ Map tiles look sharper and more professional
✅ Auction cards show map pinpoints (when coordinates exist)

All features implemented and ready to use!
