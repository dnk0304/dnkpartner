/**
 * src/lib/feature-flags.ts — runtime feature flags read from env at REQUEST
 * time (not build time), so they can be flipped on the running deployment via
 * a single env var change + restart, with NO code change and NO rebuild.
 *
 * These are read inside dynamic (per-request) server render paths — the auction
 * detail page forces dynamic rendering (it calls `auth()`), so `process.env` is
 * evaluated live on every request. Flip the value in Coolify and restart the
 * container; the change applies immediately.
 */

/**
 * SHOW_OFFICIAL_AUCTION_LINK — controls whether the "go to the official
 * auction / place your bid" action links render on the public auction detail
 * page. This is the ONLY optionally-gated surface (Dennis 2026-07-31): ALL
 * auction INFORMATION (address, pricing, description, legal data, documents)
 * is unconditionally public. This flag governs ONLY the ACTION link to the
 * official BOE subastas portal (the "Fuente oficial" source-link block, the
 * "Ficha completa en el Portal de Subastas del BOE" document link, and the
 * mobile bottom-bar "Ir al BOE / Ir a {fuente}" button).
 *
 * DEFAULT: OPEN (shown). Per Dennis's lean, the link is public unless
 * explicitly turned off. Only the literal strings `false` / `0` / `off`
 * (case-insensitive, trimmed) close it — anything else, including unset, is
 * OPEN. This makes "leave it open" the zero-config default and "gate it" an
 * explicit one-line opt-in:
 *
 *   SHOW_OFFICIAL_AUCTION_LINK=false   → hide the official-auction action link
 *   (unset) / =true / =1 / anything else → show it (default)
 */
export function showOfficialAuctionLink(): boolean {
  const v = (process.env.SHOW_OFFICIAL_AUCTION_LINK ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}
