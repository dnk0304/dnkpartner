/**
 * Health Monitoring Dashboard
 * Real-time monitoring of scraper health and system status
 */

import React, { useState, useEffect } from 'react';
import './HealthDashboard.css';

interface ScraperHealth {
  source: string;
  health: {
    status: 'healthy' | 'degraded' | 'failing' | 'mock' | 'degraded-mock' | 'no-data';
    successRate: number;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    lastSuccess: string | null;
    lastFailure: string | null;
    lastError: string | null;
    consecutiveFailures: number;
    dataFreshness: 'live' | 'stale' | 'mock' | 'none';
    avgResponseTime: number;
  };
}

interface StorageMetrics {
  totalTrends: number;
  trendsBySource: Record<string, number>;
  totalCategories: number;
  totalKeywords: number;
  dataSize: {
    trends: string;
    amazon: string;
    total: string;
  };
  oldestTrend: string;
  newestTrend: string;
}

interface ProxyStatus {
  url: string;
  isActive: boolean;
  successRate: number;
  totalRequests: number;
  lastUsed: string | null;
  avgResponseTime: number;
  consecutiveFailures: number;
}

const TRENDS_SERVICE_URL = 'http://localhost:3001';

export const HealthDashboard: React.FC = () => {
  const [scrapers, setScrapers] = useState<ScraperHealth[]>([]);
  const [storage, setStorage] = useState<StorageMetrics | null>(null);
  const [proxies, setProxies] = useState<ProxyStatus[]>([]);
  const [serviceHealth, setServiceHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealthData = async () => {
    try {
      setError(null);

      // Fetch scraper health
      const scrapersRes = await fetch(`${TRENDS_SERVICE_URL}/api/health/scrapers`);
      if (scrapersRes.ok) {
        const scrapersData = await scrapersRes.json();
        setScrapers(scrapersData);
      }

      // Fetch storage metrics
      const storageRes = await fetch(`${TRENDS_SERVICE_URL}/api/metrics/storage`);
      if (storageRes.ok) {
        const storageData = await storageRes.json();
        setStorage(storageData);
      }

      // Fetch proxy status
      const proxiesRes = await fetch(`${TRENDS_SERVICE_URL}/api/proxies`);
      if (proxiesRes.ok) {
        const proxiesData = await proxiesRes.json();
        setProxies(proxiesData);
      }

      // Fetch service health
      const healthRes = await fetch(`${TRENDS_SERVICE_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setServiceHealth(healthData);
      }

      setLoading(false);
    } catch (err: any) {
      console.error('[HealthDashboard] Error fetching data:', err);
      setError(err.message || 'Failed to connect to trends service');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();

    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'failing': return '#ef4444';
      case 'mock': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✓';
      case 'degraded': return '⚠';
      case 'failing': return '✕';
      case 'mock': return '◐';
      default: return '?';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="health-dashboard">
        <div className="loading">Loading health data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="health-dashboard">
        <div className="error-banner">
          <span className="error-icon">⚠</span>
          <div>
            <div className="error-title">Unable to connect to Trends Service</div>
            <div className="error-message">{error}</div>
            <div className="error-hint">
              Make sure the trends microservice is running on port 3001
            </div>
          </div>
          <button onClick={fetchHealthData} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="health-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>Scraper Health Dashboard</h2>
          {serviceHealth && (
            <div className="service-info">
              <span className="service-status" style={{ color: '#10b981' }}>● Online</span>
              <span className="service-uptime">Uptime: {formatUptime(serviceHealth.uptime)}</span>
            </div>
          )}
        </div>
        <div className="header-right">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={fetchHealthData} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Storage Metrics */}
      {storage && (
        <div className="metrics-section">
          <h3>Storage Metrics</h3>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-value">{storage.totalTrends}</div>
              <div className="metric-label">Total Trends</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{storage.totalCategories}</div>
              <div className="metric-label">Categories</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{storage.totalKeywords}</div>
              <div className="metric-label">Keywords</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{storage.dataSize.total}</div>
              <div className="metric-label">Data Size</div>
            </div>
          </div>
        </div>
      )}

      {/* Scrapers Status */}
      <div className="scrapers-section">
        <h3>Scraper Status</h3>
        <div className="scrapers-grid">
          {scrapers.map((scraper) => (
            <div key={scraper.source} className="scraper-card">
              <div className="scraper-header">
                <div className="scraper-title">
                  <span 
                    className="status-indicator" 
                    style={{ backgroundColor: getStatusColor(scraper.health.status) }}
                  >
                    {getStatusIcon(scraper.health.status)}
                  </span>
                  <span className="scraper-name">{scraper.source}</span>
                </div>
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(scraper.health.status) }}
                >
                  {scraper.health.status}
                </span>
              </div>

              <div className="scraper-stats">
                <div className="stat-row">
                  <span className="stat-label">Success Rate:</span>
                  <span className="stat-value">{scraper.health.successRate.toFixed(1)}%</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Attempts:</span>
                  <span className="stat-value">
                    {scraper.health.successfulAttempts}/{scraper.health.totalAttempts}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Last Success:</span>
                  <span className="stat-value">{formatDate(scraper.health.lastSuccess)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Data Freshness:</span>
                  <span 
                    className="stat-value freshness-badge"
                    style={{
                      color: scraper.health.dataFreshness === 'live' ? '#10b981' :
                             scraper.health.dataFreshness === 'stale' ? '#f59e0b' : '#8b5cf6'
                    }}
                  >
                    {scraper.health.dataFreshness}
                  </span>
                </div>
                {scraper.health.consecutiveFailures > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">Consecutive Failures:</span>
                    <span className="stat-value" style={{ color: '#ef4444' }}>
                      {scraper.health.consecutiveFailures}
                    </span>
                  </div>
                )}
                {scraper.health.avgResponseTime > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">Avg Response:</span>
                    <span className="stat-value">{scraper.health.avgResponseTime.toFixed(0)}ms</span>
                  </div>
                )}
              </div>

              {scraper.health.lastError && (
                <div className="scraper-error">
                  <span className="error-label">Last Error:</span>
                  <span className="error-text">{scraper.health.lastError}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Proxy Status */}
      {proxies.length > 0 && (
        <div className="proxies-section">
          <h3>Proxy Status</h3>
          <div className="proxies-grid">
            {proxies.map((proxy, index) => (
              <div key={index} className="proxy-card">
                <div className="proxy-header">
                  <span 
                    className="proxy-status"
                    style={{ color: proxy.isActive ? '#10b981' : '#ef4444' }}
                  >
                    ● {proxy.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="proxy-url">{proxy.url.split('@')[1] || 'Commercial'}</span>
                </div>
                <div className="proxy-stats">
                  <div className="stat-row">
                    <span className="stat-label">Success Rate:</span>
                    <span className="stat-value">{proxy.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Requests:</span>
                    <span className="stat-value">{proxy.totalRequests}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Last Used:</span>
                    <span className="stat-value">{formatDate(proxy.lastUsed)}</span>
                  </div>
                  {proxy.consecutiveFailures > 0 && (
                    <div className="stat-row">
                      <span className="stat-label">Failures:</span>
                      <span className="stat-value" style={{ color: '#ef4444' }}>
                        {proxy.consecutiveFailures}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="legend-section">
        <h4>Status Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-indicator" style={{ backgroundColor: '#10b981' }}>✓</span>
            <span>Healthy - Operating normally with live data</span>
          </div>
          <div className="legend-item">
            <span className="legend-indicator" style={{ backgroundColor: '#f59e0b' }}>⚠</span>
            <span>Degraded - Reduced success rate or stale data</span>
          </div>
          <div className="legend-item">
            <span className="legend-indicator" style={{ backgroundColor: '#ef4444' }}>✕</span>
            <span>Failing - Multiple consecutive failures</span>
          </div>
          <div className="legend-item">
            <span className="legend-indicator" style={{ backgroundColor: '#8b5cf6' }}>◐</span>
            <span>Mock - Using fallback data</span>
          </div>
        </div>
      </div>
    </div>
  );
};
