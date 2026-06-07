// Wave C1a (2026-06-07). New keys for the DB-emitted labels widened into
// `VEHICLE_CATEGORIES`:
//   Camiones        → dedicated truck SVG (box-truck silhouette — distinct
//                     from the heavy-vehicle Industrial mockup so a Camión
//                     card doesn't visually collide with construction
//                     equipment in the carousel). C3 (2026-06-07).
//   Embarcaciones   → boat SVG (synonym of Barcos)
//   Otros vehículos → generic vehicle SVG (catch-all — buses, aeronaves,
//                     unspecified — falls through anyway via the `|| GENERIC`
//                     guard below, mapped explicitly here for documentation
//                     and the future `next/image` allowlist).
const CATEGORY_IMAGES: Record<string, string> = {
  'Turismos': '/images/vehicle-car.svg',
  'Motocicletas': '/images/vehicle-motorcycle.svg',
  'Vehículos Industriales': '/images/vehicle-industrial.svg',
  'Camiones': '/images/vehicle-truck.svg',
  'Barcos': '/images/vehicle-boat.svg',
  'Embarcaciones': '/images/vehicle-boat.svg',
  'Otros vehículos': '/images/vehicle-generic.svg'
};

const GENERIC_VEHICLE_IMAGE = '/images/vehicle-generic.svg';

export function getVehicleCategoryImageUrl(category: string): string {
  return CATEGORY_IMAGES[category] || GENERIC_VEHICLE_IMAGE;
}
