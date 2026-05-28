import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExplodingTrend, TrendCategory, TrendStoreStats, DataSourceStatus } from '../types/AITrends';

// API base URL
const API_BASE = '/api/trends';

// Query keys
export const trendKeys = {
  all: ['trends'] as const,
  exploding: (filters?: ExplodingTrendsFilters) => [...trendKeys.all, 'exploding', filters] as const,
  categories: () => [...trendKeys.all, 'categories'] as const,
  stats: () => [...trendKeys.all, 'stats'] as const,
  sources: () => [...trendKeys.all, 'sources'] as const,
  trend: (id: string) => [...trendKeys.all, 'trend', id] as const,
  search: (query: string) => [...trendKeys.all, 'search', query] as const,
  multiSource: (minSources: number) => [...trendKeys.all, 'multi-source', minSources] as const,
  recent: (days: number) => [...trendKeys.all, 'recent', days] as const,
};

// Filter types
export interface ExplodingTrendsFilters {
  minScore?: number;
  maxScore?: number;
  category?: string;
  status?: ExplodingTrend['status'];
  source?: string;
  limit?: number;
}

// Response types
interface ExplodingTrendsResponse {
  success: boolean;
  trends: ExplodingTrend[];
  count: number;
}

interface CategoriesResponse {
  success: boolean;
  categories: TrendCategory[];
}

interface StatsResponse {
  success: boolean;
  stats: TrendStoreStats;
}

interface SourcesResponse {
  success: boolean;
  sources: DataSourceStatus[];
}

interface TrendResponse {
  success: boolean;
  trend: ExplodingTrend;
}

interface RefreshResponse {
  success: boolean;
  results?: any[];
  trends?: ExplodingTrend[];
  count?: number;
}

/**
 * Fetch exploding trends with optional filters
 */
async function fetchExplodingTrends(filters?: ExplodingTrendsFilters): Promise<ExplodingTrendsResponse> {
  const params = new URLSearchParams();
  
  if (filters?.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters?.maxScore !== undefined) params.set('maxScore', String(filters.maxScore));
  if (filters?.category) params.set('category', filters.category);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.source) params.set('source', filters.source);
  if (filters?.limit) params.set('limit', String(filters.limit));
  
  const url = `${API_BASE}/exploding${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Failed to fetch exploding trends');
  }
  
  return response.json();
}

/**
 * Fetch trend categories
 */
async function fetchCategories(): Promise<CategoriesResponse> {
  const response = await fetch(`${API_BASE}/categories`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  
  return response.json();
}

/**
 * Fetch trend statistics
 */
async function fetchStats(): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE}/stats`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }
  
  return response.json();
}

/**
 * Fetch data sources status
 */
async function fetchSources(): Promise<SourcesResponse> {
  const response = await fetch(`${API_BASE}/sources`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch sources');
  }
  
  return response.json();
}

/**
 * Fetch a single trend by ID
 */
async function fetchTrend(id: string): Promise<TrendResponse> {
  const response = await fetch(`${API_BASE}/${id}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch trend');
  }
  
  return response.json();
}

/**
 * Search trends
 */
async function searchTrends(query: string): Promise<ExplodingTrendsResponse> {
  const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  
  if (!response.ok) {
    throw new Error('Failed to search trends');
  }
  
  return response.json();
}

/**
 * Refresh Google Trends data
 */
async function refreshGoogleTrends(keywords: string[]): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE}/refresh/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh Google Trends');
  }
  
  return response.json();
}

/**
 * Refresh Reddit data
 */
async function refreshReddit(subreddits?: string[]): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE}/refresh/reddit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subreddits }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh Reddit data');
  }
  
  return response.json();
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch exploding trends
 */
export function useExplodingTrends(filters?: ExplodingTrendsFilters) {
  return useQuery({
    queryKey: trendKeys.exploding(filters),
    queryFn: () => fetchExplodingTrends(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch trend categories
 */
export function useTrendCategories() {
  return useQuery({
    queryKey: trendKeys.categories(),
    queryFn: fetchCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch trend statistics
 */
export function useTrendStats() {
  return useQuery({
    queryKey: trendKeys.stats(),
    queryFn: fetchStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch data sources status
 */
export function useTrendSources() {
  return useQuery({
    queryKey: trendKeys.sources(),
    queryFn: fetchSources,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch a single trend
 */
export function useTrend(id: string) {
  return useQuery({
    queryKey: trendKeys.trend(id),
    queryFn: () => fetchTrend(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to search trends
 */
export function useTrendSearch(query: string) {
  return useQuery({
    queryKey: trendKeys.search(query),
    queryFn: () => searchTrends(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to refresh Google Trends data
 */
export function useRefreshGoogleTrends() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (keywords: string[]) => refreshGoogleTrends(keywords),
    onSuccess: () => {
      // Invalidate all trend queries
      queryClient.invalidateQueries({ queryKey: trendKeys.all });
    },
  });
}

/**
 * Hook to refresh Reddit data
 */
export function useRefreshReddit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (subreddits?: string[]) => refreshReddit(subreddits),
    onSuccess: () => {
      // Invalidate all trend queries
      queryClient.invalidateQueries({ queryKey: trendKeys.all });
    },
  });
}

/**
 * Hook to fetch multi-source confirmed trends
 */
export function useMultiSourceTrends(minSources: number = 2) {
  return useQuery({
    queryKey: trendKeys.multiSource(minSources),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/multi-source?minSources=${minSources}`);
      if (!response.ok) throw new Error('Failed to fetch multi-source trends');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch recent trends
 */
export function useRecentTrends(days: number = 7) {
  return useQuery({
    queryKey: trendKeys.recent(days),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/recent?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch recent trends');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

