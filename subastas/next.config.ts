import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/subastas",
  assetPrefix: "/subastas",
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
