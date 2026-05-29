'use client';

import React from 'react';
import { AuctionItem } from '@/types';
import { HierarchicalMap } from './HierarchicalMap';

interface MapInnerProps {
  items: AuctionItem[];
  onMarkerClick?: (item: AuctionItem) => void;
  onProvinceClick?: (province: string) => void;
  onBackToProvinces?: () => void;
  onBackToMunicipalities?: () => void;
}

export const MapInner: React.FC<MapInnerProps> = ({ items, onMarkerClick, onProvinceClick, onBackToProvinces, onBackToMunicipalities }) => {
  return (
    <HierarchicalMap
      items={items}
      onMarkerClick={onMarkerClick}
      onProvinceClick={onProvinceClick}
      onBackToProvinces={onBackToProvinces}
      onBackToMunicipalities={onBackToMunicipalities}
    />
  );
};

