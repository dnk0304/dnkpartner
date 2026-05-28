# FORGE_PLAN.md — DNK Studio monorepo move + auth-gated reverse-proxy

**Brief:** `ken/PROJECTS/dnk-studio/briefs/DISPATCH-BRIEF-FORGE-studio-scaffold.md` (v2 LOCKED 2026-05-28)
**Branch:** `feature/saas-multiuser` (created off `main` @ ac5de2d)
**Mode:** Single commit at end; no push to main; no deploy (Ken owns Coolify).

## Goal

Vendor `dnkstudio/` into `dnkpartner/studio/` (Option A monorepo). Wire up auth-gated reverse-proxy so `/studio/*` on dnkpartner.com is reachable only after login. Add "Coming soon" editor stub. Produce Coolify spec + env-vars list for Ken.

## Architecture

```
Browser → dnkpartner.com/studio/kdp
   ↓ Next.js middleware (proxy.ts) runs FIRST
   ↓ validateSessionToken → if null, 302 /login?next=/studio/kdp
   ↓ if authed, continue
   ↓ Next.js rewrites() applies: /studio/:path* → http://dnkstudio:3100/:path*
   ↓ Internal Docker network — never publicly exposed
   ↓ Express on dnkstudio serves dist/ (Vite SPA) + /api/* endpoints
   ↓ SPA loaded at base /studio/, fetch wrapper rewrites /api/ → /studio/api/
   ↓ /api/studio/:path* rewrites to dnkstudio /api/:path*

Browser → dnkpartner.com/studio/editor
   ↓ Next.js route (NOT proxied) — Coming-soon stub
```

## Tech Stack

- dnkpartner: Next.js 16 (existing — unchanged)
- dnkstudio: Express 5 + Vite 7 + React 19 (vendored as-is)
- Integration: Next.js rewrites() + middleware
- Build: dnkpartner builds at root; studio builds independently inside `studio/`

## Track Execution Order

### TASK-001: Vendor dnkstudio into dnkpartner/studio/
- **Type:** File copy
- **Action:** robocopy `C:\Users\D\Desktop\dnkstudio\` → `C:\Users\D\Desktop\dnkpartner\studio\` excluding: `node_modules`, `dist`, `.git`, `.sessions`, `test-results`, `test-veo31-output`, `uploads`, `downloads/*.png/.jpg`, `.env`, `*.log`. Include `.env.example`.
- **Budget:** N/A (copy op). ✅

### TASK-002: Update dnkpartner/.gitignore for studio/
- **Type:** Config edit
- **File:** `.gitignore`
- **Add:** studio-scoped entries (node_modules, dist, .env, .sessions, test-results, test-veo31-output, uploads, downloads cache, server logs, data/cache).
- **Budget:** ~15 lines added. ✅

### TASK-003: Patch studio/server/index.ts — production SPA serve + PORT override + base /studio/
- **Type:** Server patch
- **File:** `studio/server/index.ts`
- **Edits:**
  1. PORT: change `const PORT = 3001` → `const PORT = Number(process.env.PORT) || 3001` (defaults to 3001 dev, override via env in prod).
  2. Add production block after `app.use("/styles", ...)`: serve `dist/` static, SPA fallback (express-5-safe regex via middleware function, not path-regex literal).
- **Budget:** ~20 lines. ✅

### TASK-004: Patch studio/vite.config.ts — base '/studio/'
- **Type:** Config edit
- **File:** `studio/vite.config.ts`
- **Edits:** Add `base: '/studio/'` so the built SPA's HTML/JS/CSS asset URLs are absolute under `/studio/`.
- **Budget:** 1 line added. ✅

### TASK-005: Patch studio/src/main.tsx — fetch wrapper + Router basename
- **Type:** Minimal SPA wiring
- **File:** `studio/src/main.tsx`
- **Edits:**
  1. Top-of-file: install a `window.fetch` wrapper that rewrites relative `/api/...` URLs → `/studio/api/...` AND `/downloads/...` → `/studio/downloads/...` when running under `/studio` basename (production). One-place patch — zero changes to the 113 inline fetch callsites across 32 components.
  2. Update `<BrowserRouter>` to `<BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>` so React Router uses `/studio` as base in prod, `/` in dev.
- **Rationale:** Brief constraint "No code rewrites inside `studio/`" — this is build wiring, not a code rewrite. Touches one file. Refactoring 32 component files would violate scaffold-only.
- **Budget:** ~20 lines added. ✅

### TASK-006: Update dnkpartner/next.config.ts — rewrites()
- **Type:** Config edit
- **File:** `next.config.ts`
- **Edits:** Add `async rewrites()` returning `/studio/:path*` → `${STUDIO_INTERNAL_URL}/:path*` and `/api/studio/:path*` → `${STUDIO_INTERNAL_URL}/api/:path*`. Exclude `/studio/editor` from the first rule so the Next.js stub wins. Pattern: `'/studio/:path((?!editor$|editor/).*)?'`.
- **Budget:** ~15 lines. ✅

### TASK-007: Update dnkpartner/proxy.ts — gate /studio/*
- **Type:** Middleware edit
- **File:** `proxy.ts`
- **Edits:** Add `/studio` to `PROTECTED` array; add `/studio/:path*` to matcher config.
- **Budget:** ~3 lines. ✅

### TASK-008: Create app/(studio)/studio/editor/page.tsx — Coming-soon stub
- **Type:** New file
- **File:** `app/(studio)/studio/editor/page.tsx`
- **Content:** Per brief — Pixel will polish.
- **Budget:** ~20 lines new. ✅

### TASK-009: Env-vars dig
- **Type:** Documentation
- **Action:** Read `studio/server/index.ts` + `studio/server/trends/*` + `studio/server/telegramBot.ts` + `studio/server/workflowGraph/*` — surface complete required/optional env list with brief feature mapping.
- **Output:** Section in résumé.
- **Budget:** 0 lines committed. ✅

### TASK-010: Local end-to-end verification
- **Type:** Build + smoke
- **Actions:**
  1. `cd studio && npm install` — install
  2. `cd studio && npm run build` — Vite build clean
  3. `cd ..` (root) `npm run build` — Next build clean
  4. Grep verifies middleware-before-rewrite ordering
  5. Curl test plan documented for Ken (full browser test deferred — requires running concurrent servers; minimum is build-green + route precedence verified)
- **Budget:** Verification. ✅

### TASK-011: Single commit on feature/saas-multiuser
- **Type:** Git
- **Action:** Stage all changes, commit with message per brief: `feat(studio): vendor dnkstudio under /studio + auth-gated reverse-proxy + Coming-soon editor stub`. **Do NOT push** (Ken decides timing). **Do NOT merge to main.**

## Risk Flags

- **Route alias mismatch (FLAGGED FOR PIXEL):** Brief mentions dashboard cards linking to `/studio/kdp`, `/studio/image`, `/studio/trends`. The studio SPA's actual React Router routes after `base=/studio/` are `/studio/`, `/studio/ai-trends`, `/studio/health`, `/studio/video-editor`, `/studio/site-builder`. KDP/image are MODES inside the root App.tsx, not routes. Pixel will need to either (a) link cards to `/studio/?mode=kdp` style, or (b) add proper routes inside App.tsx. Forge does NOT modify the studio SPA's router — scope is scaffold only.

- **Express 5 path-regex:** Brief notes Express 5.1 may not accept `/^(?!\/api\/|...).*/` literal regex; using middleware-function form for safety.

- **Fetch wrapper approach:** Chose Option (c) [single fetch wrapper in main.tsx] over Option (a)/(b) [refactor 32 files]. Rationale: brief constraint "No code rewrites inside `studio/`". One-file build wiring satisfies the constraint; 32-file refactor violates it.

- **Local end-to-end full browser test:** Build-green + route precedence + grep-verified ordering will be confirmed. Full multi-server browser flow (login, hit /studio/kdp, verify content) is documented for Ken to execute post-deploy — same prod verification suite from the brief.

- **/api/studio/:path* rewrite name collision:** dnkpartner has its own `/api/*` Next.js routes (auth, etc.). The rewrite source `/api/studio/:path*` is scoped enough to avoid collision (no dnkpartner route lives at `/api/studio/*`).

## Open Decisions

None — all locked per brief v2.

## Execution Status

- [ ] TASK-001 — Vendor dnkstudio
- [ ] TASK-002 — .gitignore update
- [ ] TASK-003 — Express SPA-serve + PORT override
- [ ] TASK-004 — Vite base
- [ ] TASK-005 — main.tsx fetch wrapper + Router basename
- [ ] TASK-006 — next.config.ts rewrites
- [ ] TASK-007 — proxy.ts /studio gate
- [ ] TASK-008 — editor Coming-soon stub
- [ ] TASK-009 — Env-vars dig
- [ ] TASK-010 — Local verification
- [ ] TASK-011 — Single commit
