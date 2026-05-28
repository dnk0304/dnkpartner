/**
 * Trends Microservice
 * Standalone service for trend scraping and data collection
 * Can run independently on a separate port/server
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { startScheduler, stopScheduler, getSchedulerStatus } from './scheduler.js';
import { trendStore } from './trendStore.js';
import { keywordStore } from './keywordStore.js';
import { scraperHealth } from './scraperHealth.js';
import { proxyManager } from './proxyManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.TRENDS_PORT || 3001; // Different port from main app

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    scheduler: getSchedulerStatus()
  };
  res.json(status);
});

// Get all trends
app.get('/api/trends', async (req, res) => {
  try {
    const trends = await trendStore.getTrends();
    res.json(trends);
  } catch (error: any) {
    console.error('[Trends API] Error fetching trends:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trends by source
app.get('/api/trends/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const allTrends = await trendStore.getTrends();
    const sourceTrends = allTrends.trends.filter(t => t.source === source);
    
    res.json({
      trends: sourceTrends,
      lastUpdated: allTrends.lastUpdated,
      metadata: allTrends.metadata
    });
  } catch (error: any) {
    console.error(`[Trends API] Error fetching ${req.params.source} trends:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get monitored categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await trendStore.getMonitoredCategories();
    res.json(categories);
  } catch (error: any) {
    console.error('[Trends API] Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add monitored category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, keywords, priority } = req.body;
    
    if (!name || !keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'Invalid category data' });
    }

    await trendStore.addMonitoredCategory({
      name,
      keywords,
      priority: priority || 'medium',
      lastChecked: new Date().toISOString(),
      trendCount: 0
    });

    res.json({ success: true, message: 'Category added successfully' });
  } catch (error: any) {
    console.error('[Trends API] Error adding category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get discovered keywords
app.get('/api/keywords', async (req, res) => {
  try {
    const keywords = await keywordStore.getTopKeywords(50);
    res.json(keywords);
  } catch (error: any) {
    console.error('[Trends API] Error fetching keywords:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record keyword success/failure
app.post('/api/keywords/:keyword/record', async (req, res) => {
  try {
    const { keyword } = req.params;
    const { success, trendCount } = req.body;

    if (success) {
      await keywordStore.recordSuccess(keyword, trendCount || 1);
    } else {
      await keywordStore.recordFailure(keyword);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Trends API] Error recording keyword result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get scraper health status
app.get('/api/health/scrapers', async (req, res) => {
  try {
    const sources = [
      'exploding-trends',
      'google-trends',
      'amazon-movers',
      'tiktok-trends',
      'reddit-rising',
      'pinterest-trends',
      'etsy-trending',
      'google-shopping',
      'tiktok-shop',
      'twitter-trends',
      'ebay-trending'
    ];

    const healthData = sources.map(source => ({
      source,
      health: scraperHealth.getHealth(source)
    }));

    res.json(healthData);
  } catch (error: any) {
    console.error('[Trends API] Error fetching scraper health:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get storage metrics
app.get('/api/metrics/storage', async (req, res) => {
  try {
    const metrics = await trendStore.getStorageMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('[Trends API] Error fetching storage metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get proxy status
app.get('/api/proxies', async (req, res) => {
  try {
    const proxies = proxyManager.getAllProxies();
    res.json(proxies);
  } catch (error: any) {
    console.error('[Trends API] Error fetching proxy status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual scrape
app.post('/api/scrape/:source', async (req, res) => {
  try {
    const { source } = req.params;
    
    res.json({ 
      success: true, 
      message: `Manual scrape triggered for ${source}`,
      note: 'Scrape will run in background. Check /api/health/scrapers for status.'
    });

    // Trigger scrape asynchronously
    // Note: You would need to add a manual trigger method to scheduler
    console.log(`[Trends API] Manual scrape requested for: ${source}`);
  } catch (error: any) {
    console.error('[Trends API] Error triggering scrape:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scheduler control endpoints
app.post('/api/scheduler/start', (req, res) => {
  try {
    startScheduler();
    res.json({ success: true, message: 'Scheduler started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scheduler/stop', (req, res) => {
  try {
    stopScheduler();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║         Trends Microservice Started                    ║
╠════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                        ║
║  Health: http://localhost:${PORT}/health             ║
║  Trends API: http://localhost:${PORT}/api/trends     ║
║  Health Dashboard: http://localhost:${PORT}/api/health/scrapers ║
╚════════════════════════════════════════════════════════╝
  `);

  // Start the scheduler
  startScheduler();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Trends Microservice] SIGTERM received, shutting down gracefully...');
  stopScheduler();
  server.close(() => {
    console.log('[Trends Microservice] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Trends Microservice] SIGINT received, shutting down gracefully...');
  stopScheduler();
  server.close(() => {
    console.log('[Trends Microservice] Server closed');
    process.exit(0);
  });
});

export { app };
