# 🚀 Quick Reference - Port Configuration

## ✅ Configured Ports (No Conflicts!)

| Service | dennisproject | dnksubastas |
|---------|---------------|-------------|
| **Next.js** | `:3000` | `:3005` ✨ |
| **Prisma Studio** | `:5555` | `:5556` ✨ |
| **Database** | Own SQLite | Own SQLite |

---

## 🎯 Quick Start

### Start dnksubastas
```bash
# Option 1: Use the launcher
start-dev.bat

# Option 2: Manual
npm run dev
```
Opens at: **http://localhost:3005**

### Start Prisma Studio
```bash
npm run db:studio
```
Opens at: **http://localhost:5556**

---

## 🔧 What Changed

### 1. package.json
```json
{
  "scripts": {
    "dev": "next dev -p 3005",          // Now on 3005!
    "db:studio": "npx prisma studio -p 5556"
  }
}
```

### 2. .env (Update yours!)
```env
NEXTAUTH_URL=http://localhost:3005  # Updated to 3005
PORT=3005                            # Updated to 3005
```

---

## 💡 Running Both Projects

### PowerShell Window 1 - dennisproject
```powershell
cd path\to\dennisproject
npm run dev
# → http://localhost:3000
```

### PowerShell Window 2 - dnksubastas
```powershell
cd C:\Users\D\Desktop\dnksubastas
npm run dev
# → http://localhost:3005
```

**Result**: Both run simultaneously! 🎉

---

## 🔍 Verify Ports

```powershell
# Check what's running on each port
netstat -ano | findstr :3000
netstat -ano | findstr :3005
netstat -ano | findstr :5556

# See all Node processes
Get-Process node
```

---

## ⚠️ Important: Update Your .env

**ACTION REQUIRED**: Update your `.env` file:
```env
NEXTAUTH_URL=http://localhost:3005
PORT=3005
```

Without this, auth callbacks will fail!

---

## 📱 Bookmarks to Add

- 🌐 **dnksubastas App**: http://localhost:3005 ⭐
- 📊 **dnksubastas DB**: http://localhost:5556
- 🌐 **dennisproject App**: http://localhost:3000
- 📊 **dennisproject DB**: http://localhost:5555

---

**Status**: ✅ Ready for multi-instance development!
