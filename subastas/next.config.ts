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
        // Rung-2 OSM raster tile host. Replaced the dead
        // staticmap.openstreetmap.de entry on 2026-06-02 — that service was
        // discontinued and its DNS no longer resolves. See lib/map-image.ts.
        protocol: "https",
        hostname: "tile.openstreetmap.org",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
