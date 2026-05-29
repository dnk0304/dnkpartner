import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Enhanced admin API for scraper management with configuration
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    // In development, allow access if no user system is set up yet
    const isDev = process.env.NODE_ENV === 'development';
    
    // TODO: Add proper admin role check
    if (!session?.user && !isDev) {
      console.error('Admin scraper API: No session found');
      return NextResponse.json({ 
        error: 'Unauthorized - Please log in to access admin features',
        needsAuth: true 
      }, { status: 401 });
    }
    
    if (session?.user) {
      console.log('Admin scraper API: User authenticated:', session.user.email);
    } else {
      console.log('Admin scraper API: Running in development mode without auth');
    }
    
    const body = await request.json();
    const { action } = body;
    
    switch (action) {
      case 'start-aggressive-scraper': {
        const { duration, delay, pages, categories } = body;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'aggressive_scraper.py');
        const args = [
          scraperPath,
          '--duration', (duration || 180).toString(),
          '--delay', (delay || 180).toString(),
          '--pages-per-mode', (pages || 50).toString(),
          '--categories', categories || 'properties',
          '--headless'
        ];
        
        const scraper = spawn('python', args, {
          detached: true,
          stdio: 'ignore'
        });
        
        scraper.unref();
        
        return NextResponse.json({
          success: true,
          message: 'Aggressive scraper started',
          pid: scraper.pid,
          config: { duration, delay, pages, categories }
        });
      }
      
      case 'start-scheduler': {
        const scraperPath = path.join(process.cwd(), 'scraper', 'scheduler.py');
        
        const scraper = spawn('python', [scraperPath], {
          detached: true,
          stdio: 'ignore'
        });
        
        scraper.unref();
        
        return NextResponse.json({
          success: true,
          message: 'Scheduler started',
          pid: scraper.pid
        });
      }
      
      case 'start-property-scraper': {
        const { mode, pages, categories } = body;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'property_scraper.py');
        const args = [
          scraperPath,
          '--mode', mode || 'active',
          '--pages', (pages || 50).toString(),
          '--headless'
        ];
        
        const scraper = spawn('python', args, {
          detached: true,
          stdio: 'ignore'
        });
        
        scraper.unref();
        
        return NextResponse.json({
          success: true,
          message: `Property scraper started (${mode})`,
          pid: scraper.pid
        });
      }
      
      case 'start-category-scraper': {
        const { maxPages, cooldown } = body;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'category_scraper.py');
        const args = [
          scraperPath,
          '--max-pages', (maxPages || 10).toString(),
          '--cooldown', (cooldown || 180).toString(),
          '--headless'
        ];
        
        const scraper = spawn('python', args, {
          detached: true,
          stdio: 'ignore'
        });
        
        scraper.unref();
        
        return NextResponse.json({
          success: true,
          message: 'Category-by-Category scraper started',
          pid: scraper.pid,
          config: { maxPages, cooldown, totalCombinations: 90 }
        });
      }
      
      case 'start-parallel-category-scraper': {
        const { maxPages, cooldown, batches } = body;
        const totalBatches = batches || 3;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'category_scraper.py');
        const pids: number[] = [];
        
        // Start multiple scraper instances
        for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
          const args = [
            scraperPath,
            '--batch', batchNum.toString(),
            '--total-batches', totalBatches.toString(),
            '--max-pages', (maxPages || 10).toString(),
            '--cooldown', (cooldown || 180).toString(),
            '--headless'
          ];
          
          // Add a small delay between launches to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const scraper = spawn('python', args, {
            detached: true,
            stdio: 'ignore'
          });
          
          scraper.unref();
          
          if (scraper.pid) {
            pids.push(scraper.pid);
          }
        }
        
        return NextResponse.json({
          success: true,
          message: `Started ${totalBatches} parallel category scrapers`,
          pids: pids,
          config: { maxPages, cooldown, batches: totalBatches }
        });
      }
      
      case 'start-historical-scraper': {
        const { cooldown } = body;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'historical_finished_scraper.py');
        const args = [
          scraperPath,
          '--cooldown', (cooldown || 20).toString(),
          '--headless'
        ];
        
        const scraper = spawn('python', args, {
          detached: true,
          stdio: 'ignore'
        });
        
        scraper.unref();
        
        return NextResponse.json({
          success: true,
          message: 'Historical finished scraper started',
          pid: scraper.pid,
          config: { cooldown, totalCombinations: 3120 }
        });
      }
      
      case 'start-parallel-historical-scraper': {
        const { cooldown, batches } = body;
        const totalBatches = batches || 5;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'historical_finished_scraper.py');
        const pids: number[] = [];
        
        // Start multiple scraper instances
        for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
          const args = [
            scraperPath,
            '--batch', batchNum.toString(),
            '--total-batches', totalBatches.toString(),
            '--cooldown', (cooldown || 20).toString(),
            '--headless',
            '--resume'
          ];
          
          // Add a small delay between launches to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const scraper = spawn('python', args, {
            detached: true,
            stdio: 'ignore'
          });
          
          scraper.unref();
          
          if (scraper.pid) {
            pids.push(scraper.pid);
          }
        }
        
        return NextResponse.json({
          success: true,
          message: `Started ${totalBatches} parallel category scrapers`,
          pids,
          config: { 
            cooldown, 
            totalBatches,
            combinationsPerBatch: Math.ceil(90 / totalBatches)
          }
        });
      }
      
      case 'start-parallel-finished-scraper': {
        const { maxPages, cooldown, batches } = body;
        const totalBatches = batches || 3;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'finished_scraper.py');
        const pids: number[] = [];
        
        // Start multiple finished scraper instances
        for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
          const args = [
            scraperPath,
            '--batch', batchNum.toString(),
            '--total-batches', totalBatches.toString(),
            '--max-pages', (maxPages || 50).toString(),
            '--cooldown', (cooldown || 180).toString(),
            '--headless'
          ];
          
          // Add a small delay between launches to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const scraper = spawn('python', args, {
            detached: true,
            stdio: 'ignore'
          });
          
          scraper.unref();
          
          if (scraper.pid) {
            pids.push(scraper.pid);
          }
        }
        
        return NextResponse.json({
          success: true,
          message: `Started ${totalBatches} parallel finished auction scrapers`,
          pids,
          config: { 
            maxPages, 
            cooldown, 
            totalBatches,
            combinationsPerBatch: Math.ceil(30 / totalBatches), // 30 combinations for finished (5 tipos × 2 estados × 3 bienes)
            maxAuctionsPerBatch: Math.ceil(30 / totalBatches) * maxPages * 500
          }
        });
      }
      
      case 'start-comprehensive-scraper': {
        const { maxPages, cooldown, batches } = body;
        const totalBatches = batches || 10;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'comprehensive_category_scraper.py');
        const pids: number[] = [];
        
        // Start multiple comprehensive scraper instances
        for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
          const args = [
            scraperPath,
            '--batch', batchNum.toString(),
            '--total-batches', totalBatches.toString(),
            '--max-pages', (maxPages || 10).toString(),
            '--cooldown', (cooldown || 120).toString(),
            '--headless'
          ];
          
          // Add a small delay between launches to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const scraper = spawn('python', args, {
            detached: true,
            stdio: 'ignore'
          });
          
          scraper.unref();
          
          if (scraper.pid) {
            pids.push(scraper.pid);
          }
        }
        
        const totalCombinations = 5 * 6 * 3 * 52; // 4,680 combinations
        
        return NextResponse.json({
          success: true,
          message: `Started ${totalBatches} parallel comprehensive scrapers (Category + Province)`,
          pids,
          config: { 
            maxPages, 
            cooldown, 
            totalBatches,
            totalCombinations,
            combinationsPerBatch: Math.ceil(totalCombinations / totalBatches),
            maxAuctionsPerBatch: Math.ceil(totalCombinations / totalBatches) * maxPages * 500
          }
        });
      }
      
      case 'start-historical-scraper': {
        const { maxPages, cooldown, batches } = body;
        const totalBatches = batches || 10;
        
        const scraperPath = path.join(process.cwd(), 'scraper', 'historical_scraper.py');
        const pids: number[] = [];
        
        // Start multiple historical scraper instances
        for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
          const args = [
            scraperPath,
            '--batch', batchNum.toString(),
            '--total-batches', totalBatches.toString(),
            '--max-pages', (maxPages || 20).toString(),
            '--cooldown', (cooldown || 90).toString(),
            '--headless'
          ];
          
          // Add a small delay between launches to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const scraper = spawn('python', args, {
            detached: true,
            stdio: 'ignore'
          });
          
          scraper.unref();
          
          if (scraper.pid) {
            pids.push(scraper.pid);
          }
        }
        
        const totalCombinations = 5 * 2 * 3 * 52 * 5; // 7,800 combinations (5 years)
        
        return NextResponse.json({
          success: true,
          message: `Started ${totalBatches} parallel historical scrapers (Last 5 Years)`,
          pids,
          config: { 
            maxPages, 
            cooldown, 
            totalBatches,
            totalCombinations,
            combinationsPerBatch: Math.ceil(totalCombinations / totalBatches),
            maxAuctionsPerBatch: Math.ceil(totalCombinations / totalBatches) * maxPages * 500,
            yearsRange: '2021-2026'
          }
        });
      }
      
      case 'stop-all-scrapers': {
        // Stop all Python scraper processes
        try {
          const { exec } = require('child_process');
          const util = require('util');
          const execPromise = util.promisify(exec);
          
          // Windows: taskkill to stop Python processes
          // This will stop all python.exe processes running scrapers
          await execPromise('taskkill /F /IM python.exe /T');
          
          return NextResponse.json({
            success: true,
            message: 'All Python scraper processes stopped successfully'
          });
        } catch (error: any) {
          // If no processes found, taskkill returns an error
          if (error.message && error.message.includes('not found')) {
            return NextResponse.json({
              success: true,
              message: 'No running scraper processes found'
            });
          }
          
          return NextResponse.json({
            success: false,
            message: 'Failed to stop processes: ' + (error.message || 'Unknown error')
          });
        }
      }
      
      case 'get-stats': {
        // Read database stats
        const statsPath = path.join(process.cwd(), 'scraper', 'progress', 'aggressive_scrape_stats.json');
        
        let stats = null;
        try {
          const statsData = await fs.readFile(statsPath, 'utf-8');
          stats = JSON.parse(statsData);
        } catch (e) {}
        
        return NextResponse.json({
          success: true,
          stats
        });
      }
      
      case 'get-db-stats': {
        // This would query the database directly
        // For now, return placeholder
        return NextResponse.json({
          success: true,
          stats: {
            total: 0,
            by_status: {},
            by_category: {}
          }
        });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin scraper API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    // In development, allow access if no user system is set up yet
    const isDev = process.env.NODE_ENV === 'development';
    
    if (!session?.user && !isDev) {
      console.error('Admin scraper API GET: No session found');
      return NextResponse.json({ 
        error: 'Unauthorized - Please log in to access admin features',
        needsAuth: true 
      }, { status: 401 });
    }
    
    if (session?.user) {
      console.log('Admin scraper API GET: User authenticated:', session.user.email);
    } else {
      console.log('Admin scraper API GET: Running in development mode without auth');
    }
    
    // Get all available progress files
    const progressDir = path.join(process.cwd(), 'scraper', 'progress');
    
    let activeProgress = null;
    let finishedProgress = null;
    let preProgress = null;
    let aggressiveProgress = null;
    let categoryProgress = null;
    let categoryBatchProgress: any[] = [];
    let finishedScraperProgress = null;
    let finishedScraperBatchProgress: any[] = [];
    let comprehensiveProgress = null;
    let comprehensiveBatchProgress: any[] = [];
    let historicalProgress = null;
    let historicalBatchProgress: any[] = [];
    
    try {
      const files = await fs.readdir(progressDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(progressDir, file);
          const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
          
          if (file.includes('active')) activeProgress = data;
          if (file.includes('finished') && !file.includes('finished_scraper')) finishedProgress = data;
          if (file.includes('pre')) preProgress = data;
          if (file.includes('aggressive')) aggressiveProgress = data;
          if (file.includes('category_scraper_batch_')) {
            const match = file.match(/batch_(\d+)/);
            if (match) {
              categoryBatchProgress.push({
                ...data,
                batch_num: parseInt(match[1])
              });
            }
          } else if (file.includes('category_scraper')) {
            categoryProgress = data;
          }
          if (file.includes('finished_scraper_batch_')) {
            const match = file.match(/batch_(\d+)/);
            if (match) {
              finishedScraperBatchProgress.push({
                ...data,
                batch_num: parseInt(match[1])
              });
            }
          } else if (file.includes('finished_scraper')) {
            finishedScraperProgress = data;
          }
          if (file.includes('comprehensive_scraper_batch_')) {
            const match = file.match(/batch_(\d+)/);
            if (match) {
              comprehensiveBatchProgress.push({
                ...data,
                batch_num: parseInt(match[1])
              });
            }
          } else if (file.includes('comprehensive_scraper')) {
            comprehensiveProgress = data;
          }
          if (file.includes('historical_scraper_batch_') || file.includes('historical_finished_batch_')) {
            const match = file.match(/batch_(\d+)/);
            if (match) {
              historicalBatchProgress.push({
                ...data,
                batch_num: parseInt(match[1])
              });
            }
          } else if (file.includes('historical_scraper') || file.includes('historical_finished')) {
            historicalProgress = data;
          }
        }
      }
      
      // Sort batch progress by batch number
      categoryBatchProgress.sort((a, b) => a.batch_num - b.batch_num);
      finishedScraperBatchProgress.sort((a, b) => a.batch_num - b.batch_num);
      comprehensiveBatchProgress.sort((a, b) => a.batch_num - b.batch_num);
      historicalBatchProgress.sort((a, b) => a.batch_num - b.batch_num);
      
    } catch (e) {}
    
    // Check for running processes
    let isRunning = false;
    let runningProcesses: any[] = [];
    
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Windows: Check for Python processes
      try {
        const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH');
        const lines = stdout.trim().split('\n');
        
        if (lines.length > 0 && lines[0] !== '') {
          isRunning = true;
          
          // Parse process info
          for (const line of lines) {
            if (line && line.includes('python.exe')) {
              const parts = line.split(',');
              if (parts.length >= 2) {
                const pid = parts[1].replace(/"/g, '').trim();
                runningProcesses.push({ 
                  name: 'python.exe', 
                  pid: parseInt(pid) 
                });
              }
            }
          }
        }
      } catch (e) {
        // No Python processes running
      }
    } catch (e) {
      console.error('Error checking processes:', e);
    }
    
    // Get database stats
    let dbStats = { 
      total: 0, 
      by_status: { active: 0, finished: 0, pre: 0, suspended: 0, cancelled: 0 }, 
      by_category: {} as Record<string, number>
    };
    try {
      const dbPath = path.join(process.cwd(), 'data', 'database', 'prod.db');
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      
      // Get total count
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM Auction').get() as any;
      dbStats.total = totalRow?.count || 0;
      
      // Get counts by status
      const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM Auction GROUP BY status').all() as any[];
      const statusMap: Record<string, string> = {
        'ACTIVE': 'active',
        'FINISHED': 'finished',
        'CANCELLED': 'finished', // Count CANCELLED as finished
        'SUSPENDED': 'finished', // Count SUSPENDED as finished
        'PRE_AUCTION': 'pre'
      };
      
      statusRows.forEach((row: any) => {
        const mappedStatus = statusMap[row.status] || 'active';
        if (mappedStatus === 'finished') {
          dbStats.by_status.finished += row.count;
        } else {
          dbStats.by_status[mappedStatus as keyof typeof dbStats.by_status] = row.count;
        }
        
        // Also store individual counts
        if (row.status === 'SUSPENDED') dbStats.by_status.suspended = row.count;
        if (row.status === 'CANCELLED') dbStats.by_status.cancelled = row.count;
      });
      
      // Get counts by category
      const categoryRows = db.prepare('SELECT category, COUNT(*) as count FROM Auction GROUP BY category').all() as any[];
      categoryRows.forEach((row: any) => {
        dbStats.by_category[row.category] = row.count;
      });
      
      db.close();
    } catch (e) {
      console.error('Error fetching database stats:', e);
    }
    
    return NextResponse.json({
      success: true,
      isRunning,
      runningProcesses,
      dbStats,
      progress: {
        active: activeProgress,
        finished: finishedProgress,
        pre: preProgress,
        aggressive: aggressiveProgress,
        category: categoryProgress,
        categoryBatches: categoryBatchProgress.length > 0 ? categoryBatchProgress : null,
        finishedScraper: finishedScraperProgress,
        finishedScraperBatches: finishedScraperBatchProgress.length > 0 ? finishedScraperBatchProgress : null,
        comprehensive: comprehensiveProgress,
        comprehensiveBatches: comprehensiveBatchProgress.length > 0 ? comprehensiveBatchProgress : null,
        historical: historicalProgress,
        historicalBatches: historicalBatchProgress.length > 0 ? historicalBatchProgress : null
      }
    });
  } catch (error) {
    console.error('Admin scraper API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
