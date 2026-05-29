import { AuctionItem } from "@/types";

const NOW = new Date();
const ONE_DAY = 24 * 60 * 60 * 1000;

// Helper to create dates
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * ONE_DAY);

const MOCK_IMAGES = {
  vivienda: "/images/map-placeholder.svg",
  coche: "/images/vehicle-car.svg",
  joya: "/images/map-placeholder.svg",
  barco: "/images/vehicle-boat.svg"
};

const LAS_PALMAS_ITEMS: AuctionItem[] = [
  // 3 ACTIVE AUCTIONS
  {
    id: "act-1",
    title: "Ático de lujo en Las Canteras",
    category: "Viviendas",
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 450000,
    appraisalValue: 680000,
    status: "active",
    endDate: daysFromNow(1.5), // < 48h, should be urgent
    source: "BOE",
    imageUrl: MOCK_IMAGES.vivienda
  },
  {
    id: "act-2",
    title: "BMW X5 M Competition",
    category: "Turismos",
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 32000,
    appraisalValue: 85000,
    status: "active",
    endDate: daysFromNow(5),
    source: "BOE",
    imageUrl: MOCK_IMAGES.coche
  },
  {
    id: "act-3",
    title: "Local comercial en Triana",
    category: "Locales",
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 120000,
    appraisalValue: 210000,
    status: "active",
    endDate: daysFromNow(3),
    source: "BOE",
    imageUrl: "/images/map-placeholder.svg"
  },

  // 2 PRE-AUCTIONS (TEJU)
  {
    id: "pre-1",
    title: "Villa exclusiva en Maspalomas",
    category: "Viviendas",
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 890000,
    appraisalValue: 1250000,
    status: "pre-auction",
    endDate: daysFromNow(15),
    source: "TEJU",
    imageUrl: "/images/map-placeholder.svg"
  },
  {
    id: "pre-2",
    title: "Yate Azimut 55",
    category: "Barcos",
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 250000,
    appraisalValue: 450000,
    status: "pre-auction",
    endDate: daysFromNow(20),
    source: "TEJU",
    imageUrl: MOCK_IMAGES.barco
  },

  // 15 FINISHED AUCTIONS
  ...Array.from({ length: 15 }).map((_, i) => ({
    id: `fin-${i + 1}`,
    title: `Lote Residencial #${i + 101} - Zona Puerto`,
    category: "Viviendas" as const,
    province: "Las Palmas",
    community: "Canarias",
    currentBid: 100000 + i * 5000,
    appraisalValue: 150000 + i * 8000,
    status: "finished" as const,
    endDate: daysFromNow(-(i + 1)),
    source: "BOE" as const,
    imageUrl: "/images/map-placeholder.svg"
  }))
];

export const getMockAuctions = () => LAS_PALMAS_ITEMS;
