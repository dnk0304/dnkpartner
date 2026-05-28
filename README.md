# DNK Partner

Umbrella site for Dennis Kotlenko's portfolio of products and services.

## Stack
Next.js 16 / React 19 / Tailwind v4 / Prisma 6 / PostgreSQL / Resend / Google OAuth

## Local dev
```bash
cp .env.example .env.local   # fill in DATABASE_URL + JWT secrets
npm install
npm run dev
# http://localhost:3000
```

Without `RESEND_API_KEY`, `/api/auth/register` auto-verifies the account so
the register → login flow works offline.

## Scripts
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — eslint

## Status
Phase 1 (scaffold) — auth + placeholder landing only. Pixel ships the real
landing UI in Phase 2; Ken provisions Coolify + DNS + email + deploy in
Phase 3.
