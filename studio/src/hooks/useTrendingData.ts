import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { Marketplace } from '../types/AITrends';

const API_BASE_URL = '/api';

// ==================== TYPES ====================

export interface TrendingKeyword {
  keyword: string;
  category: string;
  marketplace: Marketplace;
  searchVolume: number;
  volumeChange7d: number;
  volumeChange30d: number;
  competitionScore: number;
  opportunityScore: number;
  firstSeen: string;
  lastUpdated: string;
  isEmerging: boolean;
}

export interface MonitoredCategory {
  id: string;
  name: string;
  marketplace: Marketplace;
  addedAt: string;
  lastChecked: string;
  keywordCount: number;
}

export interface Notification {
  id: string;
  type: 'opportunity' | 'trend_alert' | 'category_update' | 'system';
  title: string;
  message: string;
  keyword?: string;
  category?: string;
  marketplace?: Marketplace;
  opportunityScore?: number;
  createdAt: string;
  read: boolean;
  actionUrl?: string;
}

export interface NotificationPreferences {
  opportunityAlerts: boolean;
  trendAlerts: boolean;
  categoryUpdates: boolean;
  minOpportunityScore: number;
  emailNotifications: boolean;
}

export interface TrendingResponse {
  success: boolean;
  keywords: TrendingKeyword[];
  total: number;
  filters: {
    category?: string;
    marketplace?: string;
    limit?: string;
    minScore?: string;
    emergingOnly?: string;
  };
}

export interface CategoriesResponse {
  success: boolean;
  presetCategories: string[];
  allCategories: string[];
  monitoredCategories: MonitoredCategory[];
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  stats: {
    total: number;
    unread: number;
    byType: Record<string, number>;
  };
}

// ==================== API FUNCTIONS ====================

async function fetchTrendingKeywords(params: {
  category?: string;
  marketplace?: Marketplace;
  limit?: number;
  minScore?: number;
  emergingOnly?: boolean;
}): Promise<TrendingResponse> {
  const searchParams = new URLSearchParams();
  if (params.category) searchParams.set('category', params.category);
  if (params.marketplace) searchParams.set('marketplace', params.marketplace);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.minScore) searchParams.set('minScore', params.minScore.toString());
  if (params.emergingOnly) searchParams.set('emergingOnly', 'true');

  const url = `${API_BASE_URL}/amazon/trending?${searchParams.toString()}`;
  console.log('[useTrendingData] Fetching trending keywords:', url);

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[useTrendingData] Failed to fetch trending keywords:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('[useTrendingData] ✓ Received', data.total, 'trending keywords');
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[useTrendingData] Network error - is the server running at', API_BASE_URL, '?');
      throw new Error('Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL);
    }
    throw error;
  }
}

async function fetchOpportunities(marketplace?: Marketplace): Promise<{
  success: boolean;
  opportunities: TrendingKeyword[];
  total: number;
}> {
  const url = marketplace
    ? `${API_BASE_URL}/amazon/trending/opportunities?marketplace=${marketplace}`
    : `${API_BASE_URL}/amazon/trending/opportunities`;
  
  console.log('[useTrendingData] Fetching opportunities:', url);

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[useTrendingData] Failed to fetch opportunities:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('[useTrendingData] ✓ Received', data.total, 'opportunities');
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[useTrendingData] Network error - is the server running at', API_BASE_URL, '?');
      throw new Error('Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL);
    }
    throw error;
  }
}

async function fetchCategories(): Promise<CategoriesResponse> {
  const url = `${API_BASE_URL}/amazon/trending/categories`;
  console.log('[useTrendingData] Fetching categories:', url);

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[useTrendingData] Failed to fetch categories:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('[useTrendingData] ✓ Received categories');
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[useTrendingData] Network error - is the server running at', API_BASE_URL, '?');
      throw new Error('Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL);
    }
    throw error;
  }
}

async function addMonitoredCategory(name: string, marketplace: Marketplace = 'US'): Promise<MonitoredCategory> {
  const response = await fetch(`${API_BASE_URL}/amazon/trending/categories/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, marketplace }),
  });
  if (!response.ok) {
    throw new Error('Failed to add monitored category');
  }
  const data = await response.json();
  return data.category;
}

async function removeMonitoredCategory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/amazon/trending/categories/monitor/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to remove monitored category');
  }
}

async function fetchNotifications(params?: {
  unreadOnly?: boolean;
  type?: string;
  limit?: number;
}): Promise<NotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
  if (params?.type) searchParams.set('type', params.type);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const url = `${API_BASE_URL}/amazon/notifications?${searchParams.toString()}`;
  console.log('[useTrendingData] Fetching notifications:', url);

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[useTrendingData] Failed to fetch notifications:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('[useTrendingData] ✓ Received', data.stats?.total || 0, 'notifications');
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[useTrendingData] Network error - is the server running at', API_BASE_URL, '?');
      throw new Error('Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL);
    }
    throw error;
  }
}

async function markNotificationRead(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/amazon/notifications/${id}/read`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }
}

async function markAllNotificationsRead(): Promise<{ markedRead: number }> {
  const response = await fetch(`${API_BASE_URL}/amazon/notifications/read-all`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read');
  }
  return response.json();
}

async function deleteNotification(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/amazon/notifications/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete notification');
  }
}

async function clearAllNotifications(): Promise<{ cleared: number }> {
  const response = await fetch(`${API_BASE_URL}/amazon/notifications`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to clear notifications');
  }
  return response.json();
}

// ==================== HOOKS ====================

/**
 * Hook to fetch trending keywords with filters
 */
export function useTrendingKeywords(params: {
  category?: string;
  marketplace?: Marketplace;
  limit?: number;
  minScore?: number;
  emergingOnly?: boolean;
  enabled?: boolean;
}): UseQueryResult<TrendingResponse, Error> {
  const { enabled = true, ...queryParams } = params;
  
  return useQuery({
    queryKey: ['trending', queryParams],
    queryFn: () => fetchTrendingKeywords(queryParams),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled,
  });
}

/**
 * Hook to fetch emerging opportunities
 */
export function useOpportunities(
  marketplace?: Marketplace,
  enabled: boolean = true
): UseQueryResult<{ success: boolean; opportunities: TrendingKeyword[]; total: number }, Error> {
  return useQuery({
    queryKey: ['opportunities', marketplace],
    queryFn: () => fetchOpportunities(marketplace),
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}

/**
 * Hook to fetch categories
 */
export function useCategories(enabled: boolean = true): UseQueryResult<CategoriesResponse, Error> {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
}

/**
 * Hook to add a monitored category
 */
export function useAddMonitoredCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ name, marketplace }: { name: string; marketplace?: Marketplace }) =>
      addMonitoredCategory(name, marketplace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

/**
 * Hook to remove a monitored category
 */
export function useRemoveMonitoredCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => removeMonitoredCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

/**
 * Hook to fetch notifications
 */
export function useNotifications(params?: {
  unreadOnly?: boolean;
  type?: string;
  limit?: number;
  enabled?: boolean;
}): UseQueryResult<NotificationsResponse, Error> {
  const { enabled = true, ...queryParams } = params || {};
  
  return useQuery({
    queryKey: ['notifications', queryParams],
    queryFn: () => fetchNotifications(queryParams),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
    enabled,
  });
}

/**
 * Hook to mark notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to clear all notifications
 */
export function useClearAllNotifications() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

