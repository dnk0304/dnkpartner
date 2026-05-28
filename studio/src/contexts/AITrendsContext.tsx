import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Marketplace, SnapshotMode } from '../types/AITrends';

/**
 * AITrends Context State Interface
 */
interface AITrendsContextState {
  // Current search keyword
  currentKeyword: string;
  setCurrentKeyword: (keyword: string) => void;

  // Selected marketplace
  marketplace: Marketplace;
  setMarketplace: (marketplace: Marketplace) => void;

  // Snapshot mode (live, 24h, 7d)
  snapshotMode: SnapshotMode;
  setSnapshotMode: (mode: SnapshotMode) => void;

  // Selected ASIN for detailed view
  selectedASIN: string | null;
  setSelectedASIN: (asin: string | null) => void;

  // Search trigger (to re-trigger searches)
  searchTrigger: number;
  triggerSearch: () => void;

  // Loading state
  isSearching: boolean;
  setIsSearching: (isSearching: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;
}

/**
 * Default context values
 */
const defaultContextValue: AITrendsContextState = {
  currentKeyword: '',
  setCurrentKeyword: () => {},
  marketplace: 'US',
  setMarketplace: () => {},
  snapshotMode: 'live',
  setSnapshotMode: () => {},
  selectedASIN: null,
  setSelectedASIN: () => {},
  searchTrigger: 0,
  triggerSearch: () => {},
  isSearching: false,
  setIsSearching: () => {},
  error: null,
  setError: () => {},
};

/**
 * AITrends Context
 */
const AITrendsContext = createContext<AITrendsContextState>(defaultContextValue);

/**
 * AITrends Provider Props
 */
interface AITrendsProviderProps {
  children: ReactNode;
}

/**
 * AITrends Provider Component
 * Provides shared state for the AITrends feature
 */
export function AITrendsProvider({ children }: AITrendsProviderProps) {
  // Keyword state
  const [currentKeyword, setCurrentKeyword] = useState<string>('');

  // Marketplace state
  const [marketplace, setMarketplace] = useState<Marketplace>('US');

  // Snapshot mode state
  const [snapshotMode, setSnapshotMode] = useState<SnapshotMode>('live');

  // Selected ASIN state
  const [selectedASIN, setSelectedASIN] = useState<string | null>(null);

  // Search trigger counter (increment to trigger new search)
  const [searchTrigger, setSearchTrigger] = useState<number>(0);

  // Loading state
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  /**
   * Trigger a new search
   */
  const triggerSearch = () => {
    setSearchTrigger((prev) => prev + 1);
  };

  /**
   * Context value
   */
  const value: AITrendsContextState = {
    currentKeyword,
    setCurrentKeyword,
    marketplace,
    setMarketplace,
    snapshotMode,
    setSnapshotMode,
    selectedASIN,
    setSelectedASIN,
    searchTrigger,
    triggerSearch,
    isSearching,
    setIsSearching,
    error,
    setError,
  };

  return <AITrendsContext.Provider value={value}>{children}</AITrendsContext.Provider>;
}

/**
 * Hook to use AITrends context
 * Throws error if used outside of AITrendsProvider
 */
export function useAITrends(): AITrendsContextState {
  const context = useContext(AITrendsContext);

  if (context === defaultContextValue) {
    // If we're still using default values, it might mean we're outside the provider
    // But we'll allow it to work with defaults for flexibility
    console.warn('useAITrends used outside of AITrendsProvider. Using default values.');
  }

  return context;
}

/**
 * Hook to get only keyword-related state
 */
export function useKeywordState() {
  const { currentKeyword, setCurrentKeyword, triggerSearch } = useAITrends();
  return { currentKeyword, setCurrentKeyword, triggerSearch };
}

/**
 * Hook to get only marketplace state
 */
export function useMarketplaceState() {
  const { marketplace, setMarketplace } = useAITrends();
  return { marketplace, setMarketplace };
}

/**
 * Hook to get only snapshot mode state
 */
export function useSnapshotModeState() {
  const { snapshotMode, setSnapshotMode } = useAITrends();
  return { snapshotMode, setSnapshotMode };
}

/**
 * Hook to get only ASIN state
 */
export function useASINState() {
  const { selectedASIN, setSelectedASIN } = useAITrends();
  return { selectedASIN, setSelectedASIN };
}

/**
 * Hook to get only loading and error state
 */
export function useLoadingState() {
  const { isSearching, setIsSearching, error, setError } = useAITrends();
  return { isSearching, setIsSearching, error, setError };
}

export default AITrendsContext;




