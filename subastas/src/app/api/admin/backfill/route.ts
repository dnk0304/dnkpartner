import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const ADMIN_EMAIL = 'dennis.kotlenko@gmail.com';
const PROGRESS_FILES = [
  path.join(process.cwd(), 'scraper', 'parallel_backfill_1_progress.json'),
  path.join(process.cwd(), 'scraper', 'parallel_backfill_2_progress.json'),
  path.join(process.cwd(), 'scraper', 'parallel_backfill_3_progress.json'),
];
const LOG_FILES = [
  path.join(process.cwd(), 'scraper', 'parallel_1_2020_2022.log'),
  path.join(process.cwd(), 'scraper', 'parallel_2_2022_2024.log'),
  path.join(process.cwd(), 'scraper', 'parallel_3_2024_2026.log'),
];

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Load all 3 parallel scrapers
    const scrapers = [];
    
    for (let i = 0; i < 3; i++) {
      const progressFile = PROGRESS_FILES[i];
      const logFile = LOG_FILES[i];
      
      let scraperData: any = {
        id: i + 1,
        isRunning: false,
        completedBatches: 0,
        totalBatches: 0,
        totalAuctions: 0,
        batchesFound: {},
        batchesFetched: {},
        errors: [],
        progress: { percentage: 0 },
      };
      
      // Load progress if exists
      if (fs.existsSync(progressFile)) {
        try {
          const progressData = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
          scraperData.completedBatches = progressData.completed_batches?.length || 0;
          scraperData.totalBatches = progressData.total_batches || 0;
          scraperData.totalAuctions = progressData.total_auctions || 0;
          scraperData.batchesFound = progressData.batches_found || {};
          scraperData.batchesFetched = progressData.batches_fetched || {};
          scraperData.errors = progressData.errors || [];
          scraperData.lastUpdated = progressData.last_updated;
          
          if (scraperData.totalBatches > 0) {
            scraperData.progress.percentage = Math.round(
              (scraperData.completedBatches / scraperData.totalBatches) * 100
            );
          }
        } catch (e) {
          console.error(`Failed to load progress for scraper ${i + 1}:`, e);
        }
      }
      
      // Check if running
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        const lastModified = stats.mtime.getTime();
        const now = Date.now();
        scraperData.isRunning = (now - lastModified) < 5 * 60 * 1000;
      }
      
      scrapers.push(scraperData);
    }
    
    // Calculate totals
    const totalAuctions = scrapers.reduce((sum, s) => sum + s.totalAuctions, 0);
    const totalBatches = scrapers.reduce((sum, s) => sum + s.totalBatches, 0);
    const completedBatches = scrapers.reduce((sum, s) => sum + s.completedBatches, 0);
    const totalErrors = scrapers.reduce((sum, s) => sum + s.errors.length, 0);
    const overallPercentage = totalBatches > 0 
      ? Math.round((completedBatches / totalBatches) * 100) 
      : 0;

    return NextResponse.json({
      scrapers,
      totals: {
        auctions: totalAuctions,
        batches: totalBatches,
        completed: completedBatches,
        percentage: overallPercentage,
        errors: totalErrors,
      },
    });

  } catch (error: any) {
    console.error('Backfill status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
