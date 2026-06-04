import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // basePath/assetPrefix removed 2026-06-02: app moved from
  // dnkpartner.com/subastas → subastasactivas.com root. The `/subastas`
  // route folder remains as the auction-listing page at root domain
  // (subastasactivas.com/subastas = the listing). Asset + API paths now
  // emit at root.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Rung-2 fallback host (wave52, 2026-06-04). Replaces the
        // tile.openstreetmap.org entry — OSM blocks hot-linking and rung-2
        // tiles rendered as a broken image in production. The new ladder
        // (auction-image-url.ts) emits Google Static Maps URLs with a
        // server-side baked-in pin. Email + site share the same source.
        //
        // Leaflet (the interactive map components) loads tiles client-side
        // OUTSIDE next/image, so removing tile.openstreetmap.org from this
        // list does NOT affect HierarchicalMap / AuctionLocationMap.
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
