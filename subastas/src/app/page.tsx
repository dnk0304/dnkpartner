"use client";

import React, { useState, useMemo, useEffect, Suspense, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/dashboard/TopBar';
import { FilterChips } from '@/components/dashboard/FilterChips';
import { StatusToggle } from '@/components/dashboard/StatusToggle';
import { AuctionCard } from '@/components/dashboard/AuctionCard';
import { AuctionMap } from '@/components/dashboard/AuctionMap';
import { AuctionDetailModal } from '@/components/dashboard/AuctionDetailModal';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { ProvinceGrid } from '@/components/dashboard/ProvinceGrid';
import { AlertsModal } from '@/components/dashboard/AlertsModal';
import { UserTier, AuctionCategory, AuctionItem, AuctionStatus, AuctionType } from '@/types';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';

function DashboardContent() {
  // Get user session
  const { data: session } = useSession();
  const { settings } = useAdminSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Refs for scrolling
  const gridRef = useRef<HTMLDivElement>(null);
  
  // State
  const [userTier, setUserTier] = useState<UserTier | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [teaserCounts, setTeaserCounts] = useState<{ active: number; preAuction: number } | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [mapAuctions, setMapAuctions] = useState<AuctionItem[]>([]); // Separate state for map data
  const [categorizedAuctions, setCategorizedAuctions] = useState<{
    active: AuctionItem[];
    preAuction: AuctionItem[];
    finished: AuctionItem[];
  }>({ active: [], preAuction: [], finished: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  
  // Counts state from API
  const [provinceCounts, setProvinceCounts] = useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});
  const [categoryCounts, setCategoryCounts] = useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});
  const [municipalityCounts, setMunicipalityCounts] = useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});
  const [dashboardStats, setDashboardStats] = useState<{
    totalAuctions: number;
    oldestAuctionYear: number | null;
    lastUpdateTime: string | null;
    activeCount: number;
    activeProperties: number;
    activeVehicles: number;
    preAuctionCount: number;
  }>({
    totalAuctions: 0,
    oldestAuctionYear: null,
    lastUpdateTime: null,
    activeCount: 0,
    activeProperties: 0,
    activeVehicles: 0,
    preAuctionCount: 0,
  });
  
  // Total status counts from database (respecting current filters)
  const [totalStatusCounts, setTotalStatusCounts] = useState<{ active: number; preAuction: number; finished: number; total: number }>({
    active: 0,
    preAuction: 0,
    finished: 0,
    total: 0
  });

  const normalizeText = (value: string) => {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const formattedToday = useMemo(
    () => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date()),
    []
  );

  const formattedLastUpdate = useMemo(() => {
    if (!dashboardStats.lastUpdateTime) return 'Sin datos';
    const parsed = new Date(dashboardStats.lastUpdateTime);
    if (Number.isNaN(parsed.getTime())) return 'Sin datos';
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  }, [dashboardStats.lastUpdateTime]);

  const PROVINCE_ALIAS_LOOKUP: Record<string, string[]> = {
    'bizkaia': ['vizcaya'],
    'gipuzkoa': ['guipuzcoa'],
    'illes balears': ['illes balear'],
  };

  const resolveProvinceSelection = (province: string) => {
    const normalized = normalizeText(province);
    const match = Object.keys(provinceCounts).find((key) => normalizeText(key) === normalized);
    if (match) return match;

    const aliases = PROVINCE_ALIAS_LOOKUP[normalized] || [];
    const aliasMatch = Object.keys(provinceCounts).find((key) => aliases.includes(normalizeText(key)));
    return aliasMatch || province;
  };

  const resolveMunicipalitySelection = (municipality: string) => {
    const normalized = normalizeText(municipality);
    const match = Object.keys(municipalityCounts).find((key) => normalizeText(key) === normalized);
    return match || municipality;
  };
  
  // Get filter state from URL params
  const searchTerm = searchParams.get('search') || '';
  const selectedCategories = searchParams.get('category')?.split(',').filter(Boolean) as AuctionCategory[] || [];
  const selectedProvinces = searchParams.get('province')?.split(',').filter(Boolean) || [];
  const selectedMunicipalities = searchParams.get('municipality')?.split(',').filter(Boolean) || [];
  const statusFilter = searchParams.get('status') as AuctionStatus | null;
  const selectedAuctionTypes = searchParams.get('auctionType')?.split(',').filter(Boolean) as AuctionType[] || [];
  const selectedStatusesParam = searchParams.get('statuses')?.split(',').filter(Boolean) as AuctionStatus[] || [];
  const DEFAULT_STATUS_SELECTION: AuctionStatus[] = ['celebrandose', 'proxima-apertura'];
  const selectedStatuses = !statusFilter && selectedStatusesParam.length === 0
    ? DEFAULT_STATUS_SELECTION
    : selectedStatusesParam;
  
  // Helper to update URL params
  const updateUrlParams = (updates: Record<string, string | string[] | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        params.delete(key);
      } else if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, value);
      }
    });
    
    router.push(`/?${params.toString()}`, { scroll: false });
  };
  
  // Setters that update URL
  const setSearchTerm = (term: string) => updateUrlParams({ search: term });
  const setSelectedCategories = (cats: AuctionCategory[]) => updateUrlParams({ category: cats });
  const setSelectedProvinces = (provs: string[]) => updateUrlParams({ province: provs, municipality: null });
  const setSelectedMunicipalities = (munis: string[]) => updateUrlParams({ municipality: munis });
  const setStatusFilter = (status: AuctionStatus | null) => updateUrlParams({ status });
  const setSelectedAuctionTypes = (types: AuctionType[]) => updateUrlParams({ auctionType: types });
  const setSelectedStatuses = (statuses: AuctionStatus[]) => updateUrlParams({ statuses });
  
  // Toggle functions for filter chips
  const toggleCategory = (category: AuctionCategory) => {
    // Single select for dropdown mode
    const newCategories = [category];
    setSelectedCategories(newCategories);
  };
  
  const toggleProvince = (province: string) => {
    // Single select for dropdown mode
    const newProvinces = [resolveProvinceSelection(province)];
    setSelectedProvinces(newProvinces);
  };
  
  const toggleMunicipality = (municipality: string) => {
    const resolved = resolveMunicipalitySelection(municipality);
    const newMunicipalities = selectedMunicipalities.includes(resolved)
      ? selectedMunicipalities.filter(m => m !== resolved)
      : [...selectedMunicipalities, resolved];
    setSelectedMunicipalities(newMunicipalities);
  };
  
  const toggleAuctionType = (auctionType: AuctionType) => {
    // Single select for dropdown mode
    const newTypes = [auctionType];
    setSelectedAuctionTypes(newTypes);
  };
  
  const toggleStatus = (status: AuctionStatus) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    setSelectedStatuses(newStatuses);
  };
  
  const clearFilters = () => {
    updateUrlParams({
      search: null,
      category: null,
      province: null,
      municipality: null,
      status: null,
      auctionType: null,
      statuses: null
    });
  };
  
  const [viewMode, setViewMode] = useState<'categorized' | 'filtered'>('filtered');
  
  // Auction detail modal state
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Update user tier from session
  useEffect(() => {
    if (session?.user?.tier) {
      const tierMap: Record<string, UserTier> = {
        'FREE': 'free',
        'GOLD': 'gold',
        'DIAMOND': 'diamond',
      };
      setUserTier(tierMap[session.user.tier] || 'free');
      setIsGuest(false);
    } else {
      // No session = guest user
      setUserTier(null);
      setIsGuest(true);
    }
  }, [session]);

  // Fetch map auctions separately (ALL auctions with coordinates for map display)
  useEffect(() => {
    const fetchMapAuctions = async () => {
      try {
        const params = new URLSearchParams();
        
        if (selectedProvinces.length === 1) {
          params.append('province', selectedProvinces[0]);
        }
        
        if (selectedCategories.length === 1) {
          params.append('category', selectedCategories[0]);
        }
        
        if (selectedStatuses.length > 0) {
          params.append('statuses', selectedStatuses.join(','));
        }
        
        const response = await fetch(`/api/auctions/map?${params.toString()}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // Convert to AuctionItem format with minimal required fields
            const mapAuctionsData = result.data.map((item: any) => ({
              ...item,
              endDate: new Date(), // Not used for map display
              source: 'BOE' as const,
              imageUrl: '',
              isLocked: false,
            }));
            setMapAuctions(mapAuctionsData);
          }
        }
      } catch (err) {
        console.error('Error fetching map auctions:', err);
      }
    };
    
    fetchMapAuctions();
  }, [selectedCategories.join(','), selectedProvinces.join(','), selectedStatuses.join(','), refreshTick]);

  // Fetch total status counts (unfiltered - for the status toggle buttons)
  useEffect(() => {
    const fetchTotalCounts = async () => {
      try {
        // Always fetch total counts WITHOUT status filter so toggle shows real totals
        const totalParams = new URLSearchParams();
        if (selectedCategories.length === 1) {
          totalParams.append('category', selectedCategories[0]);
        }
        if (selectedProvinces.length === 1) {
          totalParams.append('province', selectedProvinces[0]);
        }
        totalParams.append('groupBy', 'province');
        
        const totalResponse = await fetch(`/api/auctions/counts?${totalParams.toString()}`);
        if (totalResponse.ok) {
          const totalData = await totalResponse.json();
          if (totalData.success) {
            setTotalStatusCounts({
              active: totalData.totals?.active || 0,
              preAuction: totalData.totals?.preAuction || 0,
              finished: totalData.totals?.finished || 0,
              total: totalData.totals?.total || 0
            });
          }
        }
      } catch (err) {
        console.error('Error fetching total counts:', err);
      }
    };
    
    fetchTotalCounts();
  }, [selectedCategories.join(','), selectedProvinces.join(','), refreshTick]); // Note: statusFilter NOT included here

  // Fetch dashboard stats for map summary header
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await fetch('/api/auctions/stats');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setDashboardStats(result.data);
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      }
    };

    fetchDashboardStats();
  }, [refreshTick]);

  // Fetch filtered counts from API (for province/category/municipality display)
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        // Fetch province counts (may be filtered by status for display)
        const provinceParams = new URLSearchParams();
        if (selectedCategories.length === 1) {
          provinceParams.append('category', selectedCategories[0]);
        }
        // Don't filter by status - we want to show all counts with colors
        provinceParams.append('groupBy', 'province');
        
        const provinceResponse = await fetch(`/api/auctions/counts?${provinceParams.toString()}`);
        if (provinceResponse.ok) {
          const provinceData = await provinceResponse.json();
          if (provinceData.success) {
            // Transform API response to match expected format
            const transformedProvinceCounts: Record<string, any> = {};
            Object.keys(provinceData.counts.total || {}).forEach(key => {
              transformedProvinceCounts[key] = {
                active: provinceData.counts.active[key] || 0,
                preAuction: provinceData.counts.preAuction[key] || 0,
                finished: provinceData.counts.finished[key] || 0,
                total: provinceData.counts.total[key] || 0
              };
            });
            setProvinceCounts(transformedProvinceCounts);
          }
        }
        
        // Fetch category counts
        const categoryParams = new URLSearchParams();
        if (selectedProvinces.length === 1) {
          categoryParams.append('province', selectedProvinces[0]);
        }
        // Don't filter by status - we want to show all counts with colors
        categoryParams.append('groupBy', 'category');
        
        const categoryResponse = await fetch(`/api/auctions/counts?${categoryParams.toString()}`);
        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          if (categoryData.success) {
            const transformedCategoryCounts: Record<string, any> = {};
            Object.keys(categoryData.counts.total || {}).forEach(key => {
              transformedCategoryCounts[key] = {
                active: categoryData.counts.active[key] || 0,
                preAuction: categoryData.counts.preAuction[key] || 0,
                finished: categoryData.counts.finished[key] || 0,
                total: categoryData.counts.total[key] || 0
              };
            });
            setCategoryCounts(transformedCategoryCounts);
          }
        }
        
        // Fetch municipality counts (only if province is selected)
        if (selectedProvinces.length === 1) {
          const municipalityParams = new URLSearchParams();
          municipalityParams.append('province', selectedProvinces[0]);
          // Don't filter by status - we want to show all counts with colors
          municipalityParams.append('groupBy', 'municipality');
          
          const municipalityResponse = await fetch(`/api/auctions/counts?${municipalityParams.toString()}`);
          if (municipalityResponse.ok) {
            const municipalityData = await municipalityResponse.json();
            if (municipalityData.success) {
              const transformedMunicipalityCounts: Record<string, any> = {};
              Object.keys(municipalityData.counts.total || {}).forEach(key => {
                transformedMunicipalityCounts[key] = {
                  active: municipalityData.counts.active[key] || 0,
                  preAuction: municipalityData.counts.preAuction[key] || 0,
                  finished: municipalityData.counts.finished[key] || 0,
                  total: municipalityData.counts.total[key] || 0
                };
              });
              setMunicipalityCounts(transformedMunicipalityCounts);
            }
          }
        } else {
          setMunicipalityCounts({});
        }
      } catch (err) {
        console.error('Error fetching counts:', err);
      }
    };
    
    fetchCounts();
  }, [selectedCategories.join(','), selectedProvinces.join(','), refreshTick]); // Use join() to create stable string dependencies

  // Fetch auctions from API
  useEffect(() => {
    const fetchAuctions = async (page: number = 1, append: boolean = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setCurrentPage(1);
          setNextCursor(null);
        }
        
        // Build query params
        const params = new URLSearchParams();
        
        // If guest, don't pass tier (API will default to GUEST)
        // If logged in, pass the user's tier and userId for trial check
        if (userTier) {
          params.append('tier', userTier);
          if (session?.user?.id) {
            params.append('userId', session.user.id);
          }
        }
        
        if (selectedProvinces.length === 1) {
          params.append('province', selectedProvinces[0]);
        }
        
        if (selectedCategories.length === 1) {
          params.append('category', selectedCategories[0]);
        }
        
        if (statusFilter) {
          params.append('status', statusFilter);
        }
        
        // Add auction type filter
        if (selectedAuctionTypes.length > 0) {
          params.append('auctionTypes', selectedAuctionTypes.join(','));
        }
        
        // Add statuses filter (multiple)
        if (selectedStatuses.length > 0) {
          params.append('statuses', selectedStatuses.join(','));
        }
        
        // Add pagination
        params.append('page', page.toString());
        params.append('limit', '50'); // Load 50 at a time
        
        const response = await fetch(`/api/auctions?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch auctions');
        }
        
        const result = await response.json();
        
        if (result.success && result.data && Array.isArray(result.data)) {
          // Convert date strings to Date objects
          const auctionsWithDates = result.data.map((item: any) => ({
            ...item,
            endDate: new Date(item.endDate)
          }));
          
          if (append) {
            setAuctions(prev => [...prev, ...auctionsWithDates]);
          } else {
            setAuctions(auctionsWithDates);
          }
          
          // Update pagination state
          setHasMore(result.pagination?.hasMore || false);
          setNextCursor(result.pagination?.nextCursor || null);
          
          // Set teaser counts for guest users
          if (result.teaserCounts) {
            setTeaserCounts(result.teaserCounts);
          }
          
          // Log performance
          if (result.performance) {
            console.log(`⚡ Auctions loaded in ${result.performance.total}ms (query: ${result.performance.query}ms)`);
          }
        } else {
          setError(result.error || 'Unknown error');
        }
      } catch (err) {
        console.error('Error fetching auctions:', err);
        setError('Failed to load auctions. Please try again.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };
    
    fetchAuctions(1, false);
  }, [selectedProvinces.join(','), selectedCategories.join(','), statusFilter, selectedAuctionTypes.join(','), selectedStatuses.join(','), refreshTick]);

  // Periodic refresh to keep data fresh
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, []);
  
  // Load more function
  const loadMoreAuctions = () => {
    if (!loading && !loadingMore && hasMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      
      const fetchMore = async () => {
        try {
          setLoadingMore(true);
          
          const params = new URLSearchParams();
          
          if (userTier) {
            params.append('tier', userTier);
            if (session?.user?.id) {
              params.append('userId', session.user.id);
            }
          }
          
          if (selectedProvinces.length === 1) {
            params.append('province', selectedProvinces[0]);
          }
          
          if (selectedCategories.length === 1) {
            params.append('category', selectedCategories[0]);
          }
          
          if (statusFilter) {
            params.append('status', statusFilter);
          }
          
          if (selectedAuctionTypes.length > 0) {
            params.append('auctionTypes', selectedAuctionTypes.join(','));
          }
          
          if (selectedStatuses.length > 0) {
            params.append('statuses', selectedStatuses.join(','));
          }
          
          params.append('page', nextPage.toString());
          params.append('limit', '50');
          
          const response = await fetch(`/api/auctions?${params.toString()}`);
          const result = await response.json();
          
          if (result.success) {
            const auctionsWithDates = result.data.map((item: any) => ({
              ...item,
              endDate: new Date(item.endDate)
            }));
            
            setAuctions(prev => [...prev, ...auctionsWithDates]);
            setHasMore(result.pagination?.hasMore || false);
            setNextCursor(result.pagination?.nextCursor || null);
          }
        } catch (err) {
          console.error('Error loading more auctions:', err);
        } finally {
          setLoadingMore(false);
        }
      };
      
      fetchMore();
    }
  };

  // Client-side filtering (for search term and multiple selections)
  const filteredAuctions = useMemo(() => {
    return auctions.filter(item => {
      // Search
      if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Categories (if multiple selected, filter client-side)
      if (selectedCategories.length > 1 && !selectedCategories.includes(item.category)) {
        return false;
      }

      // Provinces (if multiple selected, filter client-side)
      if (selectedProvinces.length > 0) {
        const normalizedSelected = selectedProvinces.map((prov) => normalizeText(prov));
        const itemProvince = item.province ? normalizeText(item.province) : '';
        if (!normalizedSelected.includes(itemProvince)) {
          return false;
        }
      }

      // Municipalities
      if (selectedMunicipalities.length > 0 && item.municipality) {
        const normalizedSelected = selectedMunicipalities.map((muni) => normalizeText(muni));
        const itemMunicipality = normalizeText(item.municipality);
        if (!normalizedSelected.includes(itemMunicipality)) {
          return false;
        }
      }
      
      // Status filter (if set and doesn't match)
      // Note: statusFilter is 'active'/'finished'/'pre-auction' but item.status uses BOE values
      if (statusFilter) {
        const isActive = ['active', 'celebrandose', 'suspendida'].includes(item.status);
        const isFinished = ['finished', 'concluida-portal', 'finalizada-autoridad', 'cancelada'].includes(item.status);
        const isPreAuction = ['pre-auction', 'proxima-apertura'].includes(item.status);
        
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'finished' && !isFinished) return false;
        if (statusFilter === 'pre-auction' && !isPreAuction) return false;
      }
      
      // Auction type filter (if multiple selected, filter client-side)
      if (selectedAuctionTypes.length > 0 && item.auctionType && !selectedAuctionTypes.includes(item.auctionType)) {
        return false;
      }
      
      // Multiple statuses filter (if multiple selected, filter client-side)
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status)) {
        return false;
      }

      // Admin Visibility Filter (only apply if logged in and admin)
      if (!isGuest && settings?.visibleCategories && settings.visibleCategories.length > 0 && !settings.visibleCategories.includes(item.category)) {
        return false;
      }

      return true;
    });
  }, [auctions, searchTerm, selectedCategories, selectedProvinces, selectedMunicipalities, statusFilter, selectedAuctionTypes, selectedStatuses, settings.visibleCategories]);

  // Handle auction card click
  const handleAuctionClick = (auction: AuctionItem) => {
    setSelectedAuction(auction);
    setIsDetailModalOpen(true);
  };

  // Handle map marker click
  const handleMapMarkerClick = (auction: AuctionItem) => {
    setSelectedAuction(auction);
    setIsDetailModalOpen(true);
  };

  // Count auctions with coordinates for map badge (exclude finished auctions)
  const auctionsWithCoords = useMemo(() => {
    const finishedStatuses = ['finished', 'concluida-portal', 'finalizada-autoridad', 'cancelada'];
    return filteredAuctions.filter(
      item => item.latitude && item.longitude && !finishedStatuses.includes(item.status)
    );
  }, [filteredAuctions]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <TopBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          mapVisible={false} // Map is now always visible at top
          onMapToggle={() => {}} // No toggle needed
          mapItemCount={auctionsWithCoords.length}
          userTier={userTier || 'free'}
          onUpgradeClick={() => setIsUpgradeModalOpen(true)}
          mapItems={auctionsWithCoords}
          onMapMarkerClick={handleMapMarkerClick}
        />
        
        {/* Filter Chips & Watchlist Button */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <div className="flex-1">
            <FilterChips
              selectedCategories={selectedCategories}
              selectedProvinces={selectedProvinces}
              selectedMunicipalities={selectedMunicipalities}
              selectedAuctionTypes={selectedAuctionTypes}
              selectedStatuses={selectedStatuses}
              categoryCounts={categoryCounts}
              provinceCounts={provinceCounts}
              municipalityCounts={municipalityCounts}
              onCategoryToggle={toggleCategory}
              onProvinceToggle={toggleProvince}
              onMunicipalityToggle={toggleMunicipality}
              onAuctionTypeToggle={toggleAuctionType}
              onStatusToggle={toggleStatus}
              onClearFilters={clearFilters}
              onClearProvinces={() => setSelectedProvinces([])}
              onClearMunicipalities={() => setSelectedMunicipalities([])}
            />
          </div>
          
          <Button 
            variant="outline" 
            className="ml-4 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => setIsAlertsModalOpen(true)}
          >
            <Bell className="w-4 h-4" />
            Alertas y Seguimiento
          </Button>
        </div>
      </div>

      <main className="flex-1 max-w-[1920px] mx-auto w-full p-4 md:p-6 space-y-8">
        
        {/* 1. Dashboard Summary */}
        <section className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Total auctions since {dashboardStats.oldestAuctionYear ?? 'N/A'} - until {formattedToday}
            </h2>
            <p className="text-sm text-gray-500">
              Last update: <span className="font-medium text-gray-700">{formattedLastUpdate}</span>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <div className="rounded-lg bg-white px-3 py-2 text-gray-700 border border-gray-200">
              Total auctions: <span className="font-semibold text-gray-900">{dashboardStats.totalAuctions}</span>
            </div>
            <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
              Current active auctions: <span className="font-semibold">{dashboardStats.activeCount}</span>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
              {dashboardStats.activeVehicles} vehicles
            </div>
            <div className="rounded-lg bg-teal-50 px-3 py-2 text-teal-700">
              {dashboardStats.activeProperties} properties
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              Auctions to be released: <span className="font-semibold">{dashboardStats.preAuctionCount}</span>
            </div>
          </div>
        </section>

        {/* 2. Large Map Section */}
        <section className="w-full h-[900px] md:h-[1000px] lg:h-[1100px] rounded-2xl overflow-hidden shadow-md border border-gray-200 bg-white relative">
          <AuctionMap 
            items={mapAuctions}
            onMarkerClick={handleMapMarkerClick}
            onProvinceClick={(province) => {
              setSelectedProvinces([resolveProvinceSelection(province)]);
              setSelectedMunicipalities([]);
              if (gridRef.current) {
                gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            onBackToProvinces={() => {
              setSelectedProvinces([]);
              setSelectedMunicipalities([]);
            }}
            onBackToMunicipalities={() => {
              setSelectedMunicipalities([]);
            }}
          />
        </section>

        {/* 2. Province Grid Section */}
        <section>
          <ProvinceGrid
            provinceCounts={provinceCounts}
            onProvinceClick={(province) => {
              setSelectedProvinces([resolveProvinceSelection(province)]);
              setSelectedMunicipalities([]);
              if (gridRef.current) {
                gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            onMunicipalityClick={(municipality, province) => {
              setSelectedProvinces([resolveProvinceSelection(province)]);
              setSelectedMunicipalities([resolveMunicipalitySelection(municipality)]);
              if (gridRef.current) {
                gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          />
        </section>

        {/* 3. Auction Grid Section */}
        <section ref={gridRef} className="scroll-mt-24">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {filteredAuctions.length} Subastas Públicas activas
            </h1>
            
            <StatusToggle
              activeCount={totalStatusCounts.active}
              finishedCount={totalStatusCounts.finished}
              preAuctionCount={totalStatusCounts.preAuction}
              currentStatus={statusFilter}
              onStatusChange={setStatusFilter}
            />
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                <p className="mt-4 text-gray-500">Cargando subastas...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center text-red-500">
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Enlarged Grid: 50% larger cards */}
              <div className="grid gap-8 grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredAuctions.map((item) => (
                  <AuctionCard 
                    key={item.id} 
                    item={item} 
                    userTier={userTier || 'free'}
                    onClick={() => handleAuctionClick(item)}
                  />
                ))}
              </div>
              
              {/* Load More Button */}
              {hasMore && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={loadMoreAuctions}
                    disabled={loadingMore}
                    className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold text-lg shadow-md"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Cargando más...
                      </span>
                    ) : (
                      'Cargar más subastas'
                    )}
                  </button>
                </div>
              )}
              
              {filteredAuctions.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <p className="text-xl font-medium">No se encontraron subastas</p>
                  <p className="text-base mt-2">Intenta ajustar tus filtros o términos de búsqueda.</p>
                </div>
              )}
            </>
          )}
        </section>

      </main>
      
      {/* Auction Detail Modal */}
      <AuctionDetailModal
        auction={selectedAuction}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
      />
      
      {/* Upgrade Modal */}
      <UpgradeModal 
        open={isUpgradeModalOpen} 
        onOpenChange={setIsUpgradeModalOpen} 
      />

      {/* Alerts Modal */}
      <AlertsModal
        open={isAlertsModalOpen}
        onOpenChange={setIsAlertsModalOpen}
        initialProvince={selectedProvinces[0]}
        initialMunicipality={selectedMunicipalities[0]}
        initialCategory={selectedCategories[0]}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
