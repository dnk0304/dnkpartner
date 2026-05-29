# Port Configuration for Multiple Instances

## dnksubastas Project Ports
- **Next.js Dev Server**: `http://localhost:3001`
- **Prisma Studio**: `http://localhost:5556`

## dennisproject Ports (assumed)
- **Next.js Dev Server**: `http://localhost:3000`
- **Prisma Studio**: `http://localhost:5555`

---

## How to Run Multiple Projects Simultaneously

### Terminal 1 - dennisproject
```bash
cd C:\path\to\dennisproject
npm run dev
# Runs on http://localhost:3000
```

### Terminal 2 - dnksubastas
```bash
cd C:\Users\D\Desktop\dnksubastas
npm run dev
# Runs on http://localhost:3001
```

### Terminal 3 - Prisma Studio (dennisproject)
```bash
cd C:\path\to\dennisproject
npm run db:studio
# Opens on http://localhost:5555
```

### Terminal 4 - Prisma Studio (dnksubastas)
```bash
cd C:\Users\D\Desktop\dnksubastas
npm run db:studio
# Opens on http://localhost:5556
```

---

## Quick Access URLs

### dnksubastas (This Project)
- 🌐 **Frontend**: http://localhost:3001
- 📊 **Prisma Studio**: http://localhost:5556
- 📁 **Database**: `prisma/dev.db`

### dennisproject
- 🌐 **Frontend**: http://localhost:3000
- 📊 **Prisma Studio**: http://localhost:5555
- 📁 **Database**: (wherever dennisproject stores it)

---

## Port Configuration Files

### package.json
```json
{
  "scripts": {
    "dev": "next dev -p 3001",         // Changed from 3000
    "db:studio": "npx prisma studio -p 5556"  // Changed from 5555
  }
}
```

### NEXTAUTH_URL (in .env)
```env
NEXTAUTH_URL=http://localhost:3001
```

---

## Troubleshooting

### Port Already in Use
If you see "Port 3001 is in use", it means:
1. dnksubastas is already running
2. Another app is using port 3001

**Solution**: Check running processes
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

### Both Projects Running
You can verify both are running:
```powershell
# List all Node processes
Get-Process node

# Check specific ports
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

---

## Benefits of Separate Ports

✅ **No conflicts** - Both projects run simultaneously
✅ **Easy switching** - Just open different URLs
✅ **Independent databases** - Each has its own SQLite file
✅ **Separate Prisma Studios** - Manage databases independently
✅ **No confusion** - Clear which project you're viewing

---

**Current Configuration**: ✅ Ready for multiple instances!
