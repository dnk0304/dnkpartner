/**
 * Map Image Generator
 * Generates static map images from GPS coordinates using OpenStreetMap
 */

/**
 * Generate a static map image URL from GPS coordinates
 * Uses OpenStreetMap static map service with a red pushpin marker.
 * 
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @param width - Image width in pixels (default: 400)
 * @param height - Image height in pixels (default: 200)
 * @param zoom - Zoom level 1-20 (default: 16 for super-zoomed pinpoint)
 * @returns URL to static map image with marker
 */
export function generateMapImageUrl(
  latitude: number | null,
  longitude: number | null,
  width: number = 400,
  height: number = 200,
  zoom: number = 16
): string {
  // Fallback placeholder if no coordinates
  if (!latitude || !longitude) {
    return '/images/map-placeholder.svg';
  }

  // OpenStreetMap static map with red pushpin marker (free, no API key)
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`;
}

/**
 * Generate different sized map images for responsive design
 */
export function generateResponsiveMapImages(
  latitude: number | null,
  longitude: number | null,
  zoom: number = 17
) {
  return {
    thumbnail: generateMapImageUrl(latitude, longitude, 320, 240, zoom),
    small: generateMapImageUrl(latitude, longitude, 640, 480, zoom),
    medium: generateMapImageUrl(latitude, longitude, 800, 600, zoom),
    large: generateMapImageUrl(latitude, longitude, 1200, 900, zoom),
    card: generateMapImageUrl(latitude, longitude, 400, 300, zoom),
  };
}

/**
 * Get optimal zoom level based on property type
 */
export function getOptimalZoom(category: string): number {
  // Closer zoom for buildings to show exact location
  const zoomLevels: Record<string, number> = {
    'Viviendas': 18,
    'Locales': 18,
    'Garajes': 19,
    'Terrenos': 16,
    'Fincas rústicas': 15,
    'Naves industriales': 17,
    'Turismos': 17,
    'Motocicletas': 17,
    'Barcos': 16,
    'default': 17
  };
  
  return zoomLevels[category] || zoomLevels.default;
}
