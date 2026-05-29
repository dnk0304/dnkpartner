'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { OFFICIAL_CATEGORIES } from '@/lib/constants';
import { AuctionCategory } from '@/types';

// Define the shape of our settings
interface AdminSettings {
  visibleCategories: AuctionCategory[];
  showMap: boolean;
  showFilters: boolean;
}

// Default settings - restricting to Real Estate and Cars as requested
const DEFAULT_SETTINGS: AdminSettings = {
  visibleCategories: [
    // Generic category (catch-all for mixed auctions)
    'Subasta',
    // Real Estate
    'Viviendas',
    'Garajes',
    'Terrenos',
    'Fincas rústicas',
    'Locales',
    'Naves industriales',
    // Vehicles
    'Turismos',
    'Vehículos Industriales',
    'Motocicletas'
  ] as AuctionCategory[],
  showMap: true,
  showFilters: true,
};

interface AdminSettingsContextType {
  settings: AdminSettings;
  toggleCategoryVisibility: (category: AuctionCategory) => void;
  updateSettings: (newSettings: Partial<AdminSettings>) => void;
  resetSettings: () => void;
}

const AdminSettingsContext = createContext<AdminSettingsContextType | undefined>(undefined);

export const AdminSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('subastapro_admin_settings');
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load admin settings', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('subastapro_admin_settings', JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  const toggleCategoryVisibility = (category: AuctionCategory) => {
    setSettings(prev => {
      const isVisible = prev.visibleCategories.includes(category);
      let newCategories;
      
      if (isVisible) {
        newCategories = prev.visibleCategories.filter(c => c !== category);
      } else {
        newCategories = [...prev.visibleCategories, category];
      }
      
      return {
        ...prev,
        visibleCategories: newCategories
      };
    });
  };

  const updateSettings = (newSettings: Partial<AdminSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  // Prevent hydration mismatch by rendering children only after load (or handling it gracefully)
  // For this simple case, we'll just render. The initial render might flicker defaults if localstorage has different values,
  // but since we're using a client component wrapper, it's acceptable for this prototype.
  
  return (
    <AdminSettingsContext.Provider value={{ settings, toggleCategoryVisibility, updateSettings, resetSettings }}>
      {children}
    </AdminSettingsContext.Provider>
  );
};

export const useAdminSettings = () => {
  const context = useContext(AdminSettingsContext);
  if (context === undefined) {
    throw new Error('useAdminSettings must be used within an AdminSettingsProvider');
  }
  return context;
};
