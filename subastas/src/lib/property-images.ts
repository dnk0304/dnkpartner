const CATEGORY_IMAGES: Record<string, string> = {
  'Viviendas': '/images/property-house.svg',
  'Locales': '/images/property-commercial.svg',
  'Terrenos': '/images/property-land.svg',
  'Garajes': '/images/property-garage.svg',
  'Trasteros': '/images/property-storage.svg',
  'Fincas rústicas': '/images/property-farm.svg',
  'Naves industriales': '/images/property-warehouse.svg',
  'Otros inmuebles': '/images/property-generic.svg'
};

const GENERIC_PROPERTY_IMAGE = '/images/property-generic.svg';

export function getPropertyCategoryImageUrl(category: string): string {
  return CATEGORY_IMAGES[category] || GENERIC_PROPERTY_IMAGE;
}
