import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { KeywordSearchResult, ASINDetails, Marketplace } from '../types/AITrends';

const API_BASE_URL = '/api';

/**
 * Fetch keyword search data from the API
 */
async function fetchKeywordData(
  keyword: string,
  marketplace: Marketplace
): Promise<KeywordSearchResult> {
  const response = await fetch(`${API_BASE_URL}/amazon/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keyword, marketplace }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch keyword data' }));
    throw new Error(error.error || 'Failed to fetch keyword data');
  }

  return response.json();
}

/**
 * Fetch ASIN details from the API
 */
async function fetchASINData(
  asin: string,
  marketplace: Marketplace
): Promise<ASINDetails> {
  const response = await fetch(
    `${API_BASE_URL}/amazon/asin/${asin}?marketplace=${marketplace}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch ASIN data' }));
    throw new Error(error.error || 'Failed to fetch ASIN data');
  }

  return response.json();
}

/**
 * Fetch historical rank data for a keyword
 */
async function fetchRankHistory(
  keyword: string,
  marketplace: Marketplace
): Promise<{
  keyword: string;
  marketplace: Marketplace;
  snapshots: Array<{
    date: string;
    rank: number;
    volume: number;
    avgPrice: number;
  }>;
  lastUpdated: string;
  isSimulated: boolean;
  snapshotCount: number;
}> {
  const response = await fetch(
    `${API_BASE_URL}/amazon/history/${encodeURIComponent(keyword)}?marketplace=${marketplace}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch rank history' }));
    throw new Error(error.error || 'Failed to fetch rank history');
  }

  return response.json();
}

/**
 * Track a keyword (adds it to tracking and generates initial data)
 */
async function trackKeyword(keyword: string, marketplace: Marketplace): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/amazon/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keyword, marketplace }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to track keyword' }));
    throw new Error(error.error || 'Failed to track keyword');
  }
}

/**
 * Hook to search for a keyword and get comprehensive results
 * Includes search results, historical data, and metrics
 */
export function useKeywordSearch(
  keyword: string,
  marketplace: Marketplace,
  enabled: boolean = true
): UseQueryResult<KeywordSearchResult, Error> {
  return useQuery({
    queryKey: ['keyword', keyword, marketplace],
    queryFn: () => fetchKeywordData(keyword, marketplace),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: enabled && !!keyword && keyword.length > 0,
    retry: 1,
  });
}

/**
 * Hook to look up detailed information for a specific ASIN
 */
export function useASINLookup(
  asin: string,
  marketplace: Marketplace,
  enabled: boolean = true
): UseQueryResult<ASINDetails, Error> {
  return useQuery({
    queryKey: ['asin', asin, marketplace],
    queryFn: () => fetchASINData(asin, marketplace),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && !!asin && asin.length > 0,
    retry: 1,
  });
}

/**
 * Hook to get historical rank and volume data for a keyword
 */
export function useRankHistory(
  keyword: string,
  marketplace: Marketplace,
  enabled: boolean = true
): UseQueryResult<
  {
    keyword: string;
    marketplace: Marketplace;
    snapshots: Array<{
      date: string;
      rank: number;
      volume: number;
      avgPrice: number;
    }>;
    lastUpdated: string;
    isSimulated: boolean;
    snapshotCount: number;
  },
  Error
> {
  return useQuery({
    queryKey: ['history', keyword, marketplace],
    queryFn: () => fetchRankHistory(keyword, marketplace),
    staleTime: 30 * 60 * 1000, // 30 minutes
    enabled: enabled && !!keyword && keyword.length > 0,
    retry: 1,
  });
}

/**
 * Hook helper to track a keyword
 * Note: This is not a query hook but a helper function
 * Use in conjunction with mutation or direct call
 */
export async function addKeywordTracking(
  keyword: string,
  marketplace: Marketplace
): Promise<void> {
  return trackKeyword(keyword, marketplace);
}

/**
 * Get queue and cache statistics
 */
async function fetchQueueStats(): Promise<{
  queue: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    isProcessing: boolean;
  };
  cache: {
    total: number;
    expired: number;
  };
  history: {
    totalKeywords: number;
    totalSnapshots: number;
    simulatedKeywords: number;
    realKeywords: number;
  };
}> {
  const response = await fetch(`${API_BASE_URL}/amazon/queue/stats`);

  if (!response.ok) {
    throw new Error('Failed to fetch queue stats');
  }

  return response.json();
}

/**
 * Hook to get queue and system statistics
 */
export function useQueueStats(
  enabled: boolean = true,
  refetchInterval?: number
): UseQueryResult<
  {
    queue: {
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      isProcessing: boolean;
    };
    cache: {
      total: number;
      expired: number;
    };
    history: {
      totalKeywords: number;
      totalSnapshots: number;
      simulatedKeywords: number;
      realKeywords: number;
    };
  },
  Error
> {
  return useQuery({
    queryKey: ['queueStats'],
    queryFn: fetchQueueStats,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: refetchInterval || 30000, // 30 seconds default
    enabled,
    retry: 1,
  });
}



