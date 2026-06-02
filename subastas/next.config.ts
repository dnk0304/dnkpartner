import type { NextConfig } from "next";

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
        protocol: "https",
        hostname: "staticmap.openstreetmap.de",
      },
    ],
  },
};

export default nextConfig;
