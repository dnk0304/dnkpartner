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

Registration is disabled in this build — the only login surface is `/login`,
and only addresses in `ALLOWED_LOGIN_EMAILS` (env var, comma-separated; falls
back to `dennis.kotlenko@gmail.com`) can authenticate via either email/password
or Google OAuth. Allowlist rejects mirror wrong-password 401s so the list
stays invisible to enumeration. Add a user: insert a row in `User` then add
the address to `ALLOWED_LOGIN_EMAILS`.

## Scripts
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — eslint

## Status
Phase 1 (scaffold) — auth + placeholder landing only. Pixel ships the real
landing UI in Phase 2; Ken provisions Coolify + DNS + email + deploy in
Phase 3.
