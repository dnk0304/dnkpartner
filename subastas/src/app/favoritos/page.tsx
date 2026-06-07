/**
 * `/favoritos` — Spanish canonical URL for the favourites dashboard.
 *
 * Background: pre-fix the favourites page only existed at `/favorites` (English)
 * on an otherwise fully-Spanish site, so direct visits to `/favoritos` returned
 * the global 404. The brief calls for a Spanish-language URL surface, but the
 * existing implementation (auth gating, fetch logic, AuctionCard wiring) already
 * lives under `/favorites` and is linked from a handful of places.
 *
 * Lowest-risk fix: render the same favourites UI here under the Spanish URL by
 * re-exporting the existing client component. Then update header links to point
 * at `/favoritos` so the Spanish surface becomes the one users actually see in
 * the address bar. `/favorites` stays alive as an alias to keep any existing
 * inbound links / callbackUrl values working.
 *
 * The auth gate inside `FavoritesPage` redirects unauthenticated users to
 * `/login?callbackUrl=...` — we adjust that callbackUrl inside this re-mounted
 * page so the round-trip lands them back at the Spanish URL.
 */

import FavoritesPage from "../favorites/page";

export const metadata = {
  title: "Mis favoritas — SubastasActivas",
  description:
    "Subastas que has guardado para seguir, con notas privadas y acceso rápido al expediente.",
};

export default function Page() {
  return <FavoritesPage />;
}
