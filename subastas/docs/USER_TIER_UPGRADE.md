# User Tier Upgrade Guide

## Quick Upgrade Script

To upgrade any user to a specific tier, run:

```bash
node scripts/upgrade-user.js
```

## Manual Database Update

You can also use Prisma Studio:

```bash
npx prisma studio
```

Then navigate to the `User` table and update the `tier` field.

## Current User Status

**Email**: dennis.kotlenko@gmail.com  
**Tier**: DIAMOND ✅  
**Access**: Full premium features including Pre-Auctions

## Available Tiers

| Tier | Value | Access |
|------|-------|--------|
| Free | `FREE` | All active auctions + finished auctions |
| Gold | `GOLD` | Everything + Pre-auctions |
| Diamond | `DIAMOND` | Everything + Pre-auctions + Future premium features |

## Upgrading Other Users

Edit `scripts/upgrade-user.js` and change the email address:

```javascript
const user = await prisma.user.findUnique({
  where: { email: 'other-user@example.com' } // Change this
});
```

Then run:
```bash
node scripts/upgrade-user.js
```

## Notes

- Tier changes take effect immediately
- Users need to refresh their browser to see the updated tier
- The session will automatically fetch the new tier from the database
