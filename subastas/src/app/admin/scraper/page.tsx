'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  RefreshCw, Play, Square, Settings, Database, TrendingUp, 
  Clock, CheckCircle2, XCircle, Loader2, Zap, Calendar,
  Filter, LayersIcon, Activity
} from 'lucide-react';
import { apiFetch } from "@/lib/api-path";

const CATEGORY_OPTIONS = [
  { value: 'properties', label: 'Properties (Houses, Land, Locals, Garages)', icon: '🏠' },
  { value: 'vehicles', label: 'Vehicles (Cars, Motorcycles, Industrial)', icon: '🚗' },
  { value: 'other', label: 'Other (Boats, Machinery, Jewelry, Art)', icon: '🚢' },
  { value: 'all', label: 'All Categories', icon: '🌟' }
];

const MODE_OPTIONS = [
  { value: 'active', label: 'Active Auctions', color: 'bg-green-500' },
  { value: 'finished', label: 'Finished Auctions', color: 'bg-gray-500' },
  { value: 'pre', label: 'Pre-Auctions', color: 'bg-blue-500' }
];

export default function EnhancedAdminScraperPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  
  // Aggressive scraper settings
  const [aggressiveDuration, setAggressiveDuration] = useState('180');
  const [aggressiveDelay, setAggressiveDelay] = useState('180');
  const [aggressivePages, setAggressivePages] = useState('50');
  const [aggressiveCategories, setAggressiveCategories] = useState('properties');
  
  // Property scraper settings
  const [propertyMode, setPropertyMode] = useState('active');
  const [propertyPages, setPropertyPages] = useState('50');
  
  // Category scraper settings
  const [categoryMaxPages, setCategoryMaxPages] = useState('10');
  const [categoryCooldown, setCategoryCooldown] = useState('180');
  const [categoryResultsPerPage, setCategoryResultsPerPage] = useState('500');
  const [parallelBatches, setParallelBatches] = useState('3');
  
  // Finished scraper settings
  const [finishedMaxPages, setFinishedMaxPages] = useState('50');
  const [finishedCooldown, setFinishedCooldown] = useState('180');
  const [finishedParallelBatches, setFinishedParallelBatches] = useState('3');
  
  // Comprehensive scraper settings
  const [comprehensiveMaxPages, setComprehensiveMaxPages] = useState('10');
  const [comprehensiveCooldown, setComprehensiveCooldown] = useState('120');
  const [comprehensiveBatches, setComprehensiveBatches] = useState('10');
  
  // Historical scraper settings
  const [historicalMaxPages, setHistoricalMaxPages] = useState('20');
  const [historicalCooldown, setHistoricalCooldown] = useState('20');
  const [historicalBatches, setHistoricalBatches] = useState('5');
  
  // DB stats
  const [dbStats, setDbStats] = useState<any>(null);
  
  const fetchStatus = async () => {
    try {
      const response = await apiFetch('/api/admin/scraper');
      
      if (response.status === 401) {
        console.error('Unauthorized - redirecting to login');
        window.location.href = '/login?callbackUrl=/admin/scraper';
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        setStatus(data);
      } else if (data.needsAuth) {
        window.location.href = '/login?callbackUrl=/admin/scraper';
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };
  
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);
  
  const startAggressiveScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-aggressive-scraper',
          duration: parseInt(aggressiveDuration),
          delay: parseInt(aggressiveDelay),
          pages: parseInt(aggressivePages),
          categories: aggressiveCategories
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Aggressive scraper started!\nDuration: ${aggressiveDuration} min\nPID: ${data.pid}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startPropertyScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-property-scraper',
          mode: propertyMode,
          pages: parseInt(propertyPages)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Property scraper started!\nMode: ${propertyMode}\nPID: ${data.pid}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startCategoryScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-category-scraper',
          maxPages: parseInt(categoryMaxPages),
          cooldown: parseInt(categoryCooldown)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Category scraper started!\nTotal combinations: 90\nCooldown: ${categoryCooldown}s\nPID: ${data.pid}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startParallelCategoryScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-parallel-category-scraper',
          maxPages: parseInt(categoryMaxPages),
          cooldown: parseInt(categoryCooldown),
          batches: parseInt(parallelBatches)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Parallel category scraper started!\nBatches: ${data.config.batches}\nCombinations per batch: ${Math.ceil(90 / data.config.batches)}\nTotal combinations: 90\nPIDs: ${data.pids.join(', ')}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startHistoricalScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-historical-scraper',
          cooldown: parseInt(historicalCooldown)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Historical finished scraper started!\nTotal combinations: 3,120\nCooldown: ${historicalCooldown}s\nPID: ${data.pid}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startParallelHistoricalScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-parallel-historical-scraper',
          cooldown: parseInt(historicalCooldown),
          batches: parseInt(historicalBatches)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Parallel historical scraper started!\nBatches: ${data.config.batches}\nCombinations per batch: ${Math.ceil(3120 / data.config.batches)}\nTotal combinations: 3,120\nPIDs: ${data.pids.join(', ')}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startParallelFinishedScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-parallel-finished-scraper',
          maxPages: parseInt(finishedMaxPages),
          cooldown: parseInt(finishedCooldown),
          batches: parseInt(finishedParallelBatches)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Parallel finished scraper started!\nBatches: ${data.config.totalBatches}\nCombinations per batch: ${data.config.combinationsPerBatch}\nTotal combinations: 30\nMax auctions per batch: ${data.config.maxAuctionsPerBatch.toLocaleString()}\nPIDs: ${data.pids.join(', ')}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startComprehensiveScraper = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-comprehensive-scraper',
          maxPages: parseInt(comprehensiveMaxPages),
          cooldown: parseInt(comprehensiveCooldown),
          batches: parseInt(comprehensiveBatches)
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Comprehensive scraper started!\nBatches: ${data.config.totalBatches}\nTotal combinations: ${data.config.totalCombinations.toLocaleString()}\nCombinations per batch: ${data.config.combinationsPerBatch}\nPIDs: ${data.pids.join(', ')}`);
        await fetchStatus();
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const startScheduler = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-scheduler' }),
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`Scheduler started!\nPID: ${data.pid}`);
        await fetchStatus();
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  const stopAllScrapers = async () => {
    if (!confirm('Stop all running scrapers? This will terminate all Python scraper processes.')) return;
    
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop-all-scrapers' }),
      });
      
      const data = await response.json();
      alert(data.message);
      
      // Refresh status after stopping
      await fetchStatus();
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Enhanced Scraper Admin</h1>
          <p className="text-gray-600">Advanced configuration and monitoring</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchStatus}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="destructive"
            onClick={stopAllScrapers}
            disabled={loading}
            className="gap-2"
          >
            <Square className="h-4 w-4" />
            Stop All
          </Button>
        </div>
      </div>
      
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Total Auctions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {dbStats?.total?.toLocaleString() || '521'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {dbStats?.by_status?.active || '521'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-gray-500" />
              Finished
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">
              {dbStats?.by_status?.finished || '0'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Pre-Auction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {dbStats?.by_status?.pre || '0'}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main Tabs */}
      <Tabs defaultValue="comprehensive" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="comprehensive" className="gap-2">
            <LayersIcon className="h-4 w-4" />
            Comprehensive
          </TabsTrigger>
          <TabsTrigger value="historical" className="gap-2">
            <Calendar className="h-4 w-4" />
            Historical
          </TabsTrigger>
          <TabsTrigger value="category" className="gap-2">
            <Filter className="h-4 w-4" />
            Category
          </TabsTrigger>
          <TabsTrigger value="finished" className="gap-2">
            <Database className="h-4 w-4" />
            Finished
          </TabsTrigger>
          <TabsTrigger value="aggressive" className="gap-2">
            <Zap className="h-4 w-4" />
            Aggressive
          </TabsTrigger>
          <TabsTrigger value="single" className="gap-2">
            <Play className="h-4 w-4" />
            Single
          </TabsTrigger>
          <TabsTrigger value="scheduler" className="gap-2">
            <Activity className="h-4 w-4" />
            Scheduler
          </TabsTrigger>
        </TabsList>
        
        {/* Comprehensive Scraper Tab */}
        <TabsContent value="comprehensive">
          <Card className="border-2 border-purple-200 bg-purple-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayersIcon className="h-5 w-5 text-purple-600" />
                Comprehensive Scraper (Category + Province) 🌟
              </CardTitle>
              <CardDescription className="text-purple-900">
                <strong>COMPLETE COVERAGE:</strong> All categories × all provinces × all states (4,680 combinations)
                <br />
                Excludes "Todos" and "Cualquiera" options, uses 500 results per page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="comprehensive-max-pages">Max Pages Per Combination</Label>
                  <Input
                    id="comprehensive-max-pages"
                    type="number"
                    value={comprehensiveMaxPages}
                    onChange={(e) => setComprehensiveMaxPages(e.target.value)}
                    placeholder="10"
                    min="1"
                    max="100"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    500 results/page. 10 pages = 5,000 auctions per combo
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="comprehensive-cooldown">Cooldown (seconds)</Label>
                  <Input
                    id="comprehensive-cooldown"
                    type="number"
                    value={comprehensiveCooldown}
                    onChange={(e) => setComprehensiveCooldown(e.target.value)}
                    placeholder="120"
                    min="30"
                    max="600"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Delay between combinations to avoid rate limiting
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="comprehensive-batches">Parallel Instances</Label>
                  <Input
                    id="comprehensive-batches"
                    type="number"
                    value={comprehensiveBatches}
                    onChange={(e) => setComprehensiveBatches(e.target.value)}
                    placeholder="10"
                    min="1"
                    max="20"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Number of parallel scraper processes (recommended: 10)
                  </p>
                </div>
              </div>
              
              <div className="bg-purple-100 border border-purple-300 rounded-lg p-4">
                <h4 className="font-semibold text-purple-900 mb-2">Coverage Details:</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• <strong>5</strong> Tipo de subasta options (no "Todos")</li>
                  <li>• <strong>6</strong> Estado options (no "Cualquiera")</li>
                  <li>• <strong>3</strong> Tipo de bien options (no "Cualquiera")</li>
                  <li>• <strong>52</strong> Provinces (no "Todas las provincias")</li>
                  <li>• <strong>Total: 4,680</strong> unique combinations</li>
                  <li>• <strong>~23.4 million</strong> max auctions (4,680 × 10 pages × 500 results)</li>
                </ul>
              </div>
              
              <Separator />
              
              <div className="bg-purple-50 border-2 border-purple-400 rounded-lg p-6">
                <h4 className="font-semibold text-purple-900 mb-4 text-lg">🚀 Start Comprehensive Parallel Scraping</h4>
                <Button
                  onClick={startComprehensiveScraper}
                  disabled={loading}
                  className="w-full bg-[--color-action-soft] border border-[--color-action] hover:bg-[--color-action-soft]/80 text-[--color-ink-primary] h-12 text-lg font-semibold"
                >
                  {loading ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2" />}
                  Launch {comprehensiveBatches} Parallel Comprehensive Scrapers
                </Button>
                <p className="text-xs text-purple-700 mt-3 text-center">
                  Estimated time with {comprehensiveBatches} instances: ~{Math.round((4680 * parseInt(comprehensiveCooldown)) / (60 * parseInt(comprehensiveBatches)))} hours
                </p>
              </div>
              
              {/* Progress Display */}
              {status?.progress?.comprehensiveBatches && (
                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold">Batch Progress:</h4>
                  {status.progress.comprehensiveBatches.map((batch: any) => (
                    <Card key={batch.batch_num} className="bg-white">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Batch {batch.batch_num}/{batch.total_batches}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">New</p>
                            <p className="font-bold text-green-600">{batch.stats?.total_new || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Updated</p>
                            <p className="font-bold text-blue-600">{batch.stats?.total_updated || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Checked</p>
                            <p className="font-bold">{batch.stats?.total_checked || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Completed</p>
                            <p className="font-bold">{batch.stats?.completed_combinations || 0} / {batch.stats?.total_combinations || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Progress</p>
                            <p className="font-bold">{Math.round((batch.stats?.completed_combinations / batch.stats?.total_combinations) * 100) || 0}%</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Historical Scraper Tab */}
        <TabsContent value="historical">
          <Card className="border-2 border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-600" />
                Historical Finished Auctions Scraper (Last 5 Years) 📅
              </CardTitle>
              <CardDescription className="text-amber-900">
                <strong>HISTORICAL COVERAGE:</strong> Scrapes FINISHED auctions (Suspendida, Cancelada, Concluida, Finalizada) from 2022-2026
                <br />
                3,120 combinations total (4 estados × 3 bienes × 52 provinces × 5 years)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="historical-cooldown">Cooldown (seconds)</Label>
                  <Input
                    id="historical-cooldown"
                    type="number"
                    value={historicalCooldown}
                    onChange={(e) => setHistoricalCooldown(e.target.value)}
                    placeholder="20"
                    min="10"
                    max="600"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Delay between combinations (recommended: 20s)
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="historical-batches">Parallel Instances</Label>
                  <Input
                    id="historical-batches"
                    type="number"
                    value={historicalBatches}
                    onChange={(e) => setHistoricalBatches(e.target.value)}
                    placeholder="5"
                    min="1"
                    max="10"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Number of parallel scraper processes (recommended: 5)
                  </p>
                </div>
              </div>
              
              <div className="bg-amber-100 border border-amber-300 rounded-lg p-4">
                <h4 className="font-semibold text-amber-900 mb-2">Historical Finished Auctions Coverage:</h4>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• <strong>Years:</strong> 2022, 2023, 2024, 2025, 2026 (last 5 years)</li>
                  <li>• <strong>States:</strong> Suspendida, Cancelada, Concluida, Finalizada (4 finished states)</li>
                  <li>• <strong>Property types:</strong> Inmuebles, Vehículos, Otros bienes muebles (3 types)</li>
                  <li>• <strong>Provinces:</strong> All 52 provinces individually</li>
                  <li>• <strong>Tipo de subasta:</strong> TODOS (ALL - not filtered)</li>
                  <li>• <strong>Total: 3,120</strong> unique combinations (4 × 3 × 52 × 5)</li>
                  <li>• <strong>Results per page:</strong> 500 (MAX)</li>
                </ul>
              </div>
              
              <Separator />
              
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-lg p-6">
                <h4 className="font-semibold text-amber-900 mb-4 text-lg">⚡ Parallel Mode (Recommended)</h4>
                <div className="bg-white/70 rounded-lg p-4 mb-4">
                  <h5 className="font-semibold text-amber-800 mb-2">Performance Estimate:</h5>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• With 5 instances: ~{Math.round((3120 * parseInt(historicalCooldown)) / (60 * 5))} hours ({Math.round((3120 * parseInt(historicalCooldown)) / (60 * 5 * 60) * 10) / 10} days)</li>
                    <li>• Each instance handles: ~{Math.ceil(3120 / 5)} combinations</li>
                    <li>• RAM usage: ~{5 * 300}-{5 * 600} MB total</li>
                  </ul>
                </div>
                
                <Button
                  onClick={startParallelHistoricalScraper}
                  disabled={loading}
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  Start {historicalBatches} Parallel Scrapers 🚀
                </Button>
              </div>
              
              <div className="text-center text-sm text-gray-500">
                <p>- OR -</p>
              </div>
              
              <Button
                onClick={startHistoricalScraper}
                disabled={loading}
                size="lg"
                variant="outline"
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
                Start Single Scraper (Slower)
              </Button>
              
              {/* Progress Display */}
              {status?.progress?.historicalBatches && (
                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold">Batch Progress:</h4>
                  {status.progress.historicalBatches.map((batch: any) => (
                    <Card key={batch.batch_num} className="bg-white">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Batch {batch.batch_num}/{batch.total_batches}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">New</p>
                            <p className="font-bold text-green-600">{batch.stats?.total_new || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Updated</p>
                            <p className="font-bold text-blue-600">{batch.stats?.total_updated || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Checked</p>
                            <p className="font-bold">{batch.stats?.total_checked || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Completed</p>
                            <p className="font-bold">{batch.stats?.completed_combinations || 0} / {batch.stats?.total_combinations || 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Progress</p>
                            <p className="font-bold">{Math.round((batch.stats?.completed_combinations / batch.stats?.total_combinations) * 100) || 0}%</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Category Scraper Tab */}
        <TabsContent value="category">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-blue-500" />
                Category-by-Category Scraper (BOE Form Filters)
              </CardTitle>
              <CardDescription>
                Systematically scrapes all 90 filter combinations: Tipo de subasta × Estado × Tipo de bien
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="category-max-pages">Max Pages Per Combination</Label>
                  <Input
                    id="category-max-pages"
                    type="number"
                    value={categoryMaxPages}
                    onChange={(e) => setCategoryMaxPages(e.target.value)}
                    placeholder="10"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    With 500 results/page: {parseInt(categoryMaxPages) * 500} auctions max per combo
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="category-results-per-page">Results Per Page</Label>
                  <select
                    id="category-results-per-page"
                    value={categoryResultsPerPage}
                    onChange={(e) => setCategoryResultsPerPage(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="50">50 (slower, more requests)</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500 (recommended)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Higher = fewer HTTP requests to BOE
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="category-cooldown">Cooldown Between Combinations (seconds)</Label>
                  <Input
                    id="category-cooldown"
                    type="number"
                    value={categoryCooldown}
                    onChange={(e) => setCategoryCooldown(e.target.value)}
                    placeholder="180"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Wait time after each combination (recommended: 180s = 3 min)
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <LayersIcon className="h-5 w-5" />
                  Filter Combinations (90 total):
                </h4>
                <div className="text-sm space-y-2 mt-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="font-semibold text-purple-700">Tipo de subasta (5):</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        <li>• Judicial</li>
                        <li>• Notarial</li>
                        <li>• AEAT</li>
                        <li>• Otras admin. tributarias</li>
                        <li>• Admin. generales</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-purple-700">Estado (6):</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        <li>• Prox. apertura</li>
                        <li>• Celebrándose</li>
                        <li>• Suspendida</li>
                        <li>• Cancelada</li>
                        <li>• Concluida en Portal</li>
                        <li>• Finalizada</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-purple-700">Tipo de bien (3):</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        <li>• Inmuebles</li>
                        <li>• Vehículos</li>
                        <li>• Otros bienes muebles</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Expected Results (Single Mode):</h4>
                <ul className="text-sm space-y-1">
                  <li>• Total combinations: <strong>90</strong></li>
                  <li>• Estimated time: <strong>{((90 * parseInt(categoryCooldown)) / 3600).toFixed(1)} hours</strong> (with cooldown)</li>
                  <li>• Max auctions per combo: <strong>~{parseInt(categoryMaxPages) * parseInt(categoryResultsPerPage)}</strong></li>
                  <li>• Total potential: <strong>{(90 * parseInt(categoryMaxPages) * parseInt(categoryResultsPerPage)).toLocaleString()}+ auctions</strong></li>
                  <li>• HTTP requests saved vs 50/page: <strong>{Math.round((parseInt(categoryResultsPerPage) / 50 - 1) * 100)}%</strong></li>
                </ul>
              </div>
              
              <Separator />
              
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-green-700">
                  <Zap className="h-5 w-5" />
                  🚀 Parallel Mode (RECOMMENDED)
                </h4>
                
                <div className="mb-4">
                  <Label htmlFor="parallel-batches">Number of Parallel Instances</Label>
                  <select
                    id="parallel-batches"
                    value={parallelBatches}
                    onChange={(e) => setParallelBatches(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md mt-1"
                  >
                    <option value="2">2 (Conservative - 45 combos each)</option>
                    <option value="3">3 (Recommended - 30 combos each)</option>
                    <option value="4">4 (Fast - 22-23 combos each)</option>
                    <option value="5">5 (Very Fast - 18 combos each)</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    More instances = faster completion, but uses more RAM
                  </p>
                </div>
                
                <div className="bg-white rounded p-3 mb-3">
                  <h5 className="text-sm font-semibold mb-2">Parallel Mode Benefits:</h5>
                  <ul className="text-sm space-y-1">
                    <li>• Estimated time: <strong className="text-green-600">{((90 * parseInt(categoryCooldown)) / 3600 / parseInt(parallelBatches)).toFixed(1)} hours</strong> ({parseInt(parallelBatches)}x faster!)</li>
                    <li>• Each instance: <strong>{Math.ceil(90 / parseInt(parallelBatches))} combinations</strong></li>
                    <li>• Speed improvement: <strong className="text-green-600">{parseInt(parallelBatches)}x faster</strong> than single mode</li>
                    <li>• RAM usage: <strong>~{parseInt(parallelBatches) * 300}-{parseInt(parallelBatches) * 600} MB</strong></li>
                  </ul>
                </div>
                
                <Button
                  onClick={startParallelCategoryScraper}
                  disabled={loading}
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  Start {parallelBatches} Parallel Scrapers 🚀
                </Button>
              </div>
              
              <div className="text-center text-sm text-gray-500">
                <p>- OR -</p>
              </div>
              
              <Button
                onClick={startCategoryScraper}
                disabled={loading}
                size="lg"
                variant="outline"
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Filter className="h-5 w-5" />
                )}
                Start Single Scraper (Slower)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Finished Scraper Tab */}
        <TabsContent value="finished">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-gray-600" />
                Finished Auctions Scraper (Historical Data)
              </CardTitle>
              <CardDescription>
                Specialized scraper for finished auctions only. Focuses on 30 combinations: 5 Tipos × 2 Estados (Concluida/Finalizada) × 3 Bienes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="finished-max-pages">Max Pages Per Combination</Label>
                  <Input
                    id="finished-max-pages"
                    type="number"
                    value={finishedMaxPages}
                    onChange={(e) => setFinishedMaxPages(e.target.value)}
                    placeholder="50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    With 500 results/page: {parseInt(finishedMaxPages) * 500} auctions max per combo
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="finished-cooldown">Cooldown Between Combinations (seconds)</Label>
                  <Input
                    id="finished-cooldown"
                    type="number"
                    value={finishedCooldown}
                    onChange={(e) => setFinishedCooldown(e.target.value)}
                    placeholder="180"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Recommended: 180s (3 min) to avoid rate limits
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="finished-parallel-batches">Number of Parallel Instances</Label>
                  <Input
                    id="finished-parallel-batches"
                    type="number"
                    value={finishedParallelBatches}
                    onChange={(e) => setFinishedParallelBatches(e.target.value)}
                    placeholder="3"
                    min="2"
                    max="5"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Run 2-5 scrapers in parallel (recommended: 3)
                  </p>
                </div>
              </div>
              
              <Separator />
              
              {/* Parallel Mode Section */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <LayersIcon className="h-6 w-6 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Parallel Finished Scraper</h3>
                  <Badge className="bg-gray-600">Historical Data</Badge>
                </div>
                
                <div className="space-y-3 mb-4 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>30 Total Combinations</strong> - Split across {finishedParallelBatches} instances
                      <p className="text-gray-600">Each batch handles ~{Math.ceil(30 / parseInt(finishedParallelBatches))} combinations</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Deep Historical Scraping</strong> - {finishedMaxPages} pages per combination
                      <p className="text-gray-600">Max {parseInt(finishedMaxPages) * 500} auctions per combination = up to {(Math.ceil(30 / parseInt(finishedParallelBatches)) * parseInt(finishedMaxPages) * 500).toLocaleString()} per batch</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Estimated Duration</strong>
                      <p className="text-gray-600">
                        ~{Math.ceil((Math.ceil(30 / parseInt(finishedParallelBatches)) * (parseInt(finishedMaxPages) / 3 + parseInt(finishedCooldown) / 60)) / 60)} hours per batch with 3 instances running in parallel
                      </p>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={startParallelFinishedScraper}
                  disabled={loading}
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <LayersIcon className="h-5 w-5" />
                  )}
                  Start {finishedParallelBatches} Parallel Finished Scrapers
                </Button>
              </div>
              
              {/* Progress Display for Finished Scraper Batches */}
              {status?.progress?.finishedScraperBatches && (
                <div className="space-y-4 mt-6">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Activity className="h-5 w-5 text-gray-600" />
                    Finished Scraper Progress (Parallel Batches)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {status.progress.finishedScraperBatches.map((batch: any) => (
                      <Card key={batch.batch_num} className="bg-gray-50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>Batch {batch.batch_num}</span>
                            <Badge variant="secondary">
                              {batch.stats.completed_combinations || 0} / {Math.ceil(30 / (batch.total_batches || 3))}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-600">New:</span>
                            <span className="font-semibold text-green-600">
                              {(batch.stats.total_new || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Updated:</span>
                            <span className="font-semibold text-blue-600">
                              {(batch.stats.total_updated || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Checked:</span>
                            <span className="text-gray-700">
                              {(batch.stats.total_checked || 0).toLocaleString()}
                            </span>
                          </div>
                          {batch.current_combination && (
                            <div className="pt-2 border-t text-gray-600">
                              Current: {batch.current_combination.split('|')[0]}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Aggressive Scraper Tab */}
        <TabsContent value="aggressive">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Aggressive Multi-Mode Scraper
                <Badge variant="outline" className="text-orange-600 border-orange-600">DEPRECATED</Badge>
              </CardTitle>
              <CardDescription>
                <strong className="text-orange-600">Note:</strong> This scraper is deprecated. Please use the <strong>Category Mode</strong> scraper instead, which provides more accurate categorization using BOE form filters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={aggressiveDuration}
                    onChange={(e) => setAggressiveDuration(e.target.value)}
                    placeholder="180"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How long to run (e.g., 180 = 3 hours)
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="delay">Cooldown Between Cycles (seconds)</Label>
                  <Input
                    id="delay"
                    type="number"
                    value={aggressiveDelay}
                    onChange={(e) => setAggressiveDelay(e.target.value)}
                    placeholder="180"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Wait time after completing all 3 modes (recommended: 180s)
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="pages">Pages Per Mode</Label>
                  <Input
                    id="pages"
                    type="number"
                    value={aggressivePages}
                    onChange={(e) => setAggressivePages(e.target.value)}
                    placeholder="50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ~50 auctions per page
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="categories">Category Focus</Label>
                  <select
                    id="categories"
                    value={aggressiveCategories}
                    onChange={(e) => setAggressiveCategories(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    What to scrape
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Expected Results:</h4>
                <ul className="text-sm space-y-1">
                  <li>• {Math.floor(parseInt(aggressiveDuration) / 15)} cycles in {aggressiveDuration} minutes</li>
                  <li>• ~{(parseInt(aggressivePages) * 50 * Math.floor(parseInt(aggressiveDuration) / 15 / 3)).toLocaleString()} auctions per mode</li>
                  <li>• Total estimate: {(parseInt(aggressivePages) * 50 * Math.floor(parseInt(aggressiveDuration) / 15)).toLocaleString()}+ auctions</li>
                </ul>
              </div>
              
              <Button
                onClick={startAggressiveScraper}
                disabled={loading}
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Zap className="h-5 w-5" />
                )}
                Start Aggressive Scraper
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Single Scraper Tab */}
        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Single Mode Property Scraper
                <Badge variant="outline" className="text-orange-600 border-orange-600">DEPRECATED</Badge>
              </CardTitle>
              <CardDescription>
                <strong className="text-orange-600">Note:</strong> This scraper is deprecated. Please use the <strong>Category Mode</strong> scraper instead for better results.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="mode">Scraping Mode</Label>
                  <select
                    id="mode"
                    value={propertyMode}
                    onChange={(e) => setPropertyMode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {MODE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="property-pages">Max Pages</Label>
                  <Input
                    id="property-pages"
                    type="number"
                    value={propertyPages}
                    onChange={(e) => setPropertyPages(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>
              
              <Button
                onClick={startPropertyScraper}
                disabled={loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Property Scraper ({propertyMode})
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Scheduler Tab */}
        <TabsContent value="scheduler">
          <Card>
            <CardHeader>
              <CardTitle>Automated Scheduler</CardTitle>
              <CardDescription>
                Run scrapers on a schedule (hourly, daily, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-gray-50 border rounded-lg p-4">
                <h4 className="font-semibold mb-3">Default Schedule:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Active properties: Every 1 hour
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    Pre-auction: Every 6 hours
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-gray-500" />
                    Status monitoring: Every 30 minutes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    Daily full scan: 03:00 AM
                  </li>
                </ul>
              </div>
              
              <Button
                onClick={startScheduler}
                disabled={loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4" />
                )}
                Start Automated Scheduler
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Running Processes */}
      {status && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Running Processes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status.isRunning && status.runningProcesses && status.runningProcesses.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 mb-3">
                  <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse"></div>
                  <span className="font-semibold">{status.runningProcesses.length} Python scraper process(es) running</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  {status.runningProcesses.map((proc: any, idx: number) => (
                    <div key={idx} className="text-sm font-mono flex justify-between items-center">
                      <span>{proc.name}</span>
                      <span className="text-gray-500">PID: {proc.pid}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                <span>No scraper processes currently running</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Current Progress */}
      {status?.progress && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Current Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {status.progress.categoryBatches && status.progress.categoryBatches.length > 0 && (
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    🔀 Parallel Category Scrapers ({status.progress.categoryBatches.length} batches)
                  </h4>
                  <div className="mt-3 space-y-3">
                    {status.progress.categoryBatches.map((batch: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 rounded p-3">
                        <p className="font-semibold text-sm">Batch {batch.batch_num}/{batch.total_batches}</p>
                        <p className="text-xs text-gray-600">
                          Started: {new Date(batch.started_at).toLocaleString()}
                        </p>
                        <p className="text-xs">
                          Completed: {batch.stats?.completed_combinations || 0} combinations
                        </p>
                        <div className="text-xs space-y-0.5 mt-1">
                          <p>📊 Checked: {batch.stats?.total_checked?.toLocaleString() || 0}</p>
                          <p>🆕 New: {batch.stats?.total_new?.toLocaleString() || 0}</p>
                          <p>🔄 Updated: {batch.stats?.total_updated?.toLocaleString() || 0}</p>
                          <p>⏭️ Skipped: {batch.stats?.total_skipped?.toLocaleString() || 0}</p>
                        </div>
                        {batch.current_combination && (
                          <p className="text-xs text-gray-500 mt-1">
                            Current: {batch.current_combination}
                          </p>
                        )}
                      </div>
                    ))}
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                      <p className="text-sm font-semibold">Combined Progress:</p>
                      <p className="text-sm">
                        Total completed: {status.progress.categoryBatches.reduce((sum: number, b: any) => sum + (b.stats?.completed_combinations || 0), 0)} combinations
                      </p>
                      <div className="text-sm space-y-0.5 mt-1">
                        <p>📊 Checked: {status.progress.categoryBatches.reduce((sum: number, b: any) => sum + (b.stats?.total_checked || 0), 0).toLocaleString()}</p>
                        <p>🆕 New: {status.progress.categoryBatches.reduce((sum: number, b: any) => sum + (b.stats?.total_new || 0), 0).toLocaleString()}</p>
                        <p>🔄 Updated: {status.progress.categoryBatches.reduce((sum: number, b: any) => sum + (b.stats?.total_updated || 0), 0).toLocaleString()}</p>
                        <p>⏭️ Skipped: {status.progress.categoryBatches.reduce((sum: number, b: any) => sum + (b.stats?.total_skipped || 0), 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {status.progress.category && (
                <div className="border-l-4 border-purple-500 pl-4">
                  <h4 className="font-semibold">Category-by-Category Scraper (Single)</h4>
                  <p className="text-sm text-gray-600">
                    Started: {new Date(status.progress.category.started_at).toLocaleString()}
                  </p>
                  <p className="text-sm">
                    Completed: {status.progress.category.stats?.completed_combinations || 0} / {status.progress.category.stats?.total_combinations || 90}
                  </p>
                  <div className="text-sm space-y-0.5 mt-1">
                    <p className="font-medium">Statistics:</p>
                    <p>📊 Checked: {status.progress.category.stats?.total_checked?.toLocaleString() || 0}</p>
                    <p>🆕 New: {status.progress.category.stats?.total_new?.toLocaleString() || 0}</p>
                    <p>🔄 Updated: {status.progress.category.stats?.total_updated?.toLocaleString() || 0}</p>
                    <p>⏭️ Skipped: {status.progress.category.stats?.total_skipped?.toLocaleString() || 0}</p>
                  </div>
                  {status.progress.category.current_combination && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current: {status.progress.category.current_combination}
                    </p>
                  )}
                </div>
              )}
              {status.progress.aggressive && (
                <div className="border-l-4 border-yellow-500 pl-4">
                  <h4 className="font-semibold">Aggressive Scraper</h4>
                  <p className="text-sm text-gray-600">
                    Started: {new Date(status.progress.aggressive.started_at).toLocaleString()}
                  </p>
                  <p className="text-sm">
                    Total scraped: {status.progress.aggressive.total_scraped || 0}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
