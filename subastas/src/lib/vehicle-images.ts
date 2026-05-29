const CATEGORY_IMAGES: Record<string, string> = {
  'Turismos': '/images/vehicle-car.svg',
  'Motocicletas': '/images/vehicle-motorcycle.svg',
  'Vehículos Industriales': '/images/vehicle-industrial.svg',
  'Barcos': '/images/vehicle-boat.svg'
};

const GENERIC_VEHICLE_IMAGE = '/images/vehicle-generic.svg';

export function getVehicleCategoryImageUrl(category: string): string {
  return CATEGORY_IMAGES[category] || GENERIC_VEHICLE_IMAGE;
}
