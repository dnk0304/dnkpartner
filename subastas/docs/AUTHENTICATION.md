# Authentication System Documentation

This document describes the authentication system implemented for SubastaPro using NextAuth.js v5 with email-based magic links.

## Overview

The authentication system uses:
- **NextAuth.js v5 (beta)** - Modern authentication for Next.js
- **Prisma Adapter** - Database integration with SQLite/PostgreSQL
- **Resend** - Email delivery service for magic links
- **Email-only authentication** - No passwords required

## Architecture

### Files Created

1. **`src/lib/auth.ts`** - NextAuth configuration with Prisma adapter and Resend provider
2. **`src/lib/email-templates.ts`** - Branded HTML email templates for magic links
3. **`src/app/api/auth/[...nextauth]/route.ts`** - NextAuth API route handler
4. **`src/types/auth.d.ts`** - TypeScript type extensions for session
5. **`src/components/SessionProvider.tsx`** - Client-side session provider wrapper
6. **`src/middleware.ts`** - Route protection middleware
7. **`src/app/login/page.tsx`** - Login page with magic link form
8. **`src/app/register/page.tsx`** - Registration page
9. **`src/app/verify-request/page.tsx`** - Email verification confirmation page
10. **`src/app/auth/error/page.tsx`** - Authentication error handling page

### Database Schema

The following tables are already in the Prisma schema and support NextAuth:

- **User** - User accounts (extended with `name`, `emailVerified`, `image`, `tier`)
- **Account** - OAuth account connections
- **Session** - Active user sessions
- **VerificationToken** - Magic link tokens

## How It Works

### User Registration Flow

1. User visits `/register`
2. Enters email address
3. System sends magic link email via Resend
4. User clicks link in email
5. NextAuth verifies token and creates account
6. User is redirected to dashboard

### Sign In Flow

1. User visits `/login`
2. Enters email address
3. System sends magic link email via Resend
4. User clicks link in email
5. NextAuth verifies token and creates session
6. User is redirected to dashboard

### Session Management

- Sessions stored in database (not JWT)
- 30-day session duration
- Sessions update every 24 hours
- Middleware protects all routes except auth pages

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# NextAuth Configuration
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Resend Email Provider
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=SubastaPro <noreply@subastapro.com>
```

### Generate NextAuth Secret

```bash
openssl rand -base64 32
```

### Get Resend API Key

1. Sign up at https://resend.com
2. Verify your domain or use the test domain
3. Create an API key
4. Add to `.env`

## Usage in Components

### Server Components

```typescript
import { auth } from "@/lib/auth";

export default async function ServerPage() {
  const session = await auth();
  
  if (!session) {
    return <div>Not authenticated</div>;
  }
  
  return <div>Welcome {session.user.email}</div>;
}
```

### Client Components

```typescript
'use client';
import { useSession } from "next-auth/react";

export default function ClientComponent() {
  const { data: session, status } = useSession();
  
  if (status === "loading") {
    return <div>Loading...</div>;
  }
  
  if (!session) {
    return <div>Not authenticated</div>;
  }
  
  return <div>Welcome {session.user.email}</div>;
}
```

### Sign Out

```typescript
import { signOut } from "next-auth/react";

<button onClick={() => signOut()}>Sign out</button>
```

## Email Templates

Two branded email templates are included:

1. **Magic Link Email** - For sign-in requests
   - Professional design with SubastaPro branding
   - Security information
   - 24-hour expiration notice

2. **Verification Email** - For new account creation
   - Welcome message
   - Feature highlights
   - Verification instructions

Both templates are responsive and include:
- Gradient header with logo
- Clear call-to-action button
- Security tips
- Professional footer

## Route Protection

The middleware automatically protects all routes except:
- `/login` - Login page
- `/register` - Registration page
- `/verify-request` - Email sent confirmation
- `/auth/*` - Auth error pages
- `/api/*` - API routes (handle auth separately)
- Static assets

To allow public access to specific routes, update `src/middleware.ts`:

```typescript
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|register|verify-request|auth|public-page).*)',
  ],
};
```

## Security Features

- **No password storage** - Magic links only
- **Token expiration** - Links expire after 24 hours
- **One-time use** - Each link can only be used once
- **Email verification** - Ensures user owns the email
- **Secure sessions** - Database-backed with automatic cleanup
- **CSRF protection** - Built into NextAuth
- **XSS protection** - Escaped email content in templates

## Testing

### Local Development

1. Set up a Resend account with test domain
2. Add API key to `.env`
3. Start the dev server: `npm run dev`
4. Visit `http://localhost:3000/register`
5. Enter your email
6. Check your inbox for the magic link

### Production

1. Verify your domain in Resend
2. Update `EMAIL_FROM` with your domain
3. Generate new `NEXTAUTH_SECRET`
4. Update `NEXTAUTH_URL` to production URL
5. Deploy and test

## Troubleshooting

### "Configuration error"
- Check `NEXTAUTH_SECRET` is set
- Verify `NEXTAUTH_URL` matches your domain

### "Verification failed"
- Link may have expired (24 hours)
- Link may have been used already
- Try requesting a new link

### Emails not sending
- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard for errors
- Verify domain is verified (production)
- Check spam folder

### Session not persisting
- Verify database schema is up to date: `npx prisma db push`
- Check browser cookies are enabled
- Verify `NEXTAUTH_URL` matches current domain

## Future Enhancements

Potential additions:
- OAuth providers (Google, GitHub)
- Two-factor authentication
- Email verification for existing users
- Account linking
- Custom session data
- Rate limiting for email sends
- Admin role management

## Resources

- [NextAuth.js Documentation](https://authjs.dev)
- [Resend Documentation](https://resend.com/docs)
- [Prisma Adapter](https://authjs.dev/reference/adapter/prisma)
