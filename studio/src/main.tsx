import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AITrends } from './components/AITrends'
import { HealthDashboard } from './components/HealthDashboard'
import { VideoEditor } from './components/VideoEditor'
import { SiteBuilder } from './components/SiteBuilder/SiteBuilder'
import './index.css'

// ─────────────────────────────────────────────────────────────────────────────
// dnkpartner monorepo integration shim (2026-05-28).
//
// In production this SPA is loaded at `https://dnkpartner.com/studio/` behind
// a Next.js rewrite (`/studio/:path*` → `http://dnkstudio:3100/:path*`).
// Components across this codebase issue inline `fetch('/api/...')` and
// `fetch('/downloads/...')` calls (113+ callsites across 32 files). Those
// resolve relative to the document origin — which in production is
// `dnkpartner.com`, NOT the studio container. Without rewriting those URLs
// they would hit dnkpartner's Next.js routes and 404.
//
// Solution: a one-time global fetch wrapper that prepends `/studio` to any
// relative URL starting with one of the studio's mountpoints. Activated only
// when the SPA is served from a non-root base (i.e. `import.meta.env.BASE_URL`
// is `/studio/` from vite.config.ts). In dev (`BASE_URL === '/'`) it's a no-op.
//
// This avoids touching the 113 callsites — keeping the studio code unmodified
// per the brief's "no code rewrites inside studio/" scaffold-only constraint.
// ─────────────────────────────────────────────────────────────────────────────
const STUDIO_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')  // '/studio' or ''
if (STUDIO_BASE) {
  const STUDIO_PREFIXES = ['/api/', '/downloads/', '/kdp-assets/', '/styles/']
  const originalFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      for (const prefix of STUDIO_PREFIXES) {
        if (input.startsWith(prefix) && !input.startsWith(`${STUDIO_BASE}${prefix}`)) {
          input = `${STUDIO_BASE}${input}`
          break
        }
      }
    } else if (input instanceof URL && input.origin === window.location.origin && input.pathname.startsWith('/')) {
      for (const prefix of STUDIO_PREFIXES) {
        if (input.pathname.startsWith(prefix) && !input.pathname.startsWith(`${STUDIO_BASE}${prefix}`)) {
          input = new URL(`${STUDIO_BASE}${input.pathname}${input.search}${input.hash}`, input.origin)
          break
        }
      }
    }
    return originalFetch(input as RequestInfo, init)
  }) as typeof window.fetch
}

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* basename matches Vite's BASE_URL: '/studio' in prod, '' (default) in dev.
          React Router expects basename without trailing slash. */}
      <BrowserRouter basename={STUDIO_BASE || undefined}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/ai-trends" element={<AITrends />} />
          <Route path="/health" element={<HealthDashboard />} />
          <Route path="/video-editor" element={<VideoEditor />} />
          <Route path="/site-builder" element={<SiteBuilder />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
