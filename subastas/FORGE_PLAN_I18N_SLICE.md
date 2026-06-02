# FORGE_PLAN — F7 Phase 7a (i18n SLICE)

## Goal
Wire next-intl with ES default, EN at `/en`, translate the header + homepage + login + register pages.
Compose with existing SEO middleware. Do NOT break `/subastas/...` SEO routes or `/subastas/subasta/...` resolver.

## Approach — minimal-disruption i18n WITHOUT a `[locale]` route segment
next-intl v4 normally wants `[locale]/` segments. Moving 20+ route folders is high regression risk
for a slice scope and would conflict with the just-shipped SEO middleware rules that key off literal
`/subastas/...`. Instead:

1. **Middleware** detects locale from URL prefix (`/en/...`) and/or `NEXT_LOCALE` cookie.
   - For `/en/<rest>`: rewrite to `/<rest>` and set a request header `x-locale=en` + cookie.
   - Otherwise: locale defaults to `es`. Existing SEO rules still run after locale rewrite.
2. **`i18n/request.ts`** (next-intl `getRequestConfig`) reads `x-locale` request header → loads `es.json` or `en.json`.
3. **Root layout** reads locale via `getLocale()` from next-intl → sets `<html lang>` correctly.
4. **Components** use `useTranslations()` / `getTranslations()` for translated strings.

This keeps every existing route folder where it is. Compatible with the SEO middleware composition
(SEO rules run on path-tail, agnostic to whether `/en` was already stripped). 'en' is in
`RESERVED_SEGMENTS` so no province/category collides.

## Tasks

- TASK-1: install next-intl ✅ (4.13.0)
- TASK-2: write `src/i18n/request.ts`, `src/i18n/routing.ts`, `messages/es.json`, `messages/en.json`
- TASK-3: update `next.config.ts` with `createNextIntlPlugin()`
- TASK-4: COMPOSE middleware — locale handling first (rewrite `/en/x`→`/x`, set `x-locale` header), then existing SEO rules
- TASK-5: layout.tsx — wrap with `NextIntlClientProvider`, dynamic `<html lang>` from `getLocale()`
- TASK-6: translate `ObservatoryHeader` (nav + wordmark trust signal + search placeholder + Entrar/Mi panel)
- TASK-7: translate `HomeObservatory` (hero, ticker labels, "Cómo funciona", footer)
- TASK-8: translate `login/page.tsx` + `register/page.tsx`
- TASK-9: verify — `tsc --noEmit`, `next build`, serve, curl `/`, `/en`, `/subastas/provincia/barcelona`, `/subastas/subasta/...`
- TASK-10: commit + push `sa/i18n-slice`

## Risk
- Middleware composition: locale rewrite MUST happen before SEO matchers, otherwise `/en/subastas/provincia/...` won't be normalized. Implementation: strip `/en/` first, then run existing SEO logic on the stripped path. If SEO redirects, prepend `/en` back to the redirect target.
- next-intl v4 without `[locale]` segments: must avoid `Link` from next-intl (which auto-prefixes). Use plain next/link until Pixel's switcher ships — that's fine for the slice. Pixel will add a locale-aware switcher.

## Deferred to 7b
- Translation of: /subastas listing, /subastas/subasta detail, /alerts, /favorites, /subscription, /admin, /blog, /guia, /forgot-password, /reset-password, /notifications, /diamond, /HomeObservatory deep map captions.
- Pixel: actual header switcher control (globe icon + dropdown + cookie persistence + locale-aware Link wrapper).
