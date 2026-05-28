/**
 * Parallel Execution Engine
 * Enables concurrent processing of scraping tasks with intelligent batching
 * and progress tracking
 */

export interface ParallelConfig {
  maxConcurrency: number;        // Max parallel requests (default: 5)
  batchSize: number;             // Items per batch (default: 10)
  batchDelay: number;            // Delay between batches (ms)
  retryFailedItems: boolean;     // Auto-retry failed items
  maxRetries: number;            // Max retries per item
  onProgress?: (progress: ProgressInfo) => void;  // Progress callback
}

export interface ProcessingResult<T = any> {
  item: T;
  success: boolean;
  result?: any;
  error?: string;
  attempts: number;
  duration: number;
}

export interface ProgressInfo {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  inProgress: number;
  percentage: number;
}

export interface PriorityQueueItem<T> {
  item: T;
  priority: number; // Higher number = higher priority
}

const DEFAULT_CONFIG: ParallelConfig = {
  maxConcurrency: 5,
  batchSize: 10,
  batchDelay: 2000,
  retryFailedItems: true,
  maxRetries: 3,
};

export class ParallelEngine {
  /**
   * Process an array of items in parallel with batching and retry logic
   */
  async processBatch<T>(
    items: T[],
    processor: (item: T) => Promise<any>,
    config: Partial<ParallelConfig> = {}
  ): Promise<ProcessingResult<T>[]> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const results: ProcessingResult<T>[] = [];
    const failedItems: { item: T; attempts: number }[] = [];
    
    const progress: ProgressInfo = {
      total: items.length,
      completed: 0,
      successful: 0,
      failed: 0,
      inProgress: 0,
      percentage: 0,
    };

    console.log(`[ParallelEngine] Processing ${items.length} items with concurrency ${finalConfig.maxConcurrency}`);
    
    // Process in chunks to respect concurrency limits
    for (let i = 0; i < items.length; i += finalConfig.batchSize) {
      const batch = items.slice(i, i + finalConfig.batchSize);
      console.log(`[ParallelEngine] Processing batch ${Math.floor(i / finalConfig.batchSize) + 1}/${Math.ceil(items.length / finalConfig.batchSize)} (${batch.length} items)`);
      
      // Process batch with concurrency control
      const batchResults = await this.processConcurrent(
        batch,
        processor,
        finalConfig.maxConcurrency
      );
      
      // Collect results and track failures
      for (const result of batchResults) {
        results.push(result);
        progress.completed++;
        
        if (result.success) {
          progress.successful++;
        } else {
          progress.failed++;
          if (finalConfig.retryFailedItems && result.attempts < finalConfig.maxRetries) {
            failedItems.push({ item: result.item, attempts: result.attempts });
          }
        }
        
        progress.percentage = Math.round((progress.completed / progress.total) * 100);
        
        // Call progress callback if provided
        if (finalConfig.onProgress) {
          finalConfig.onProgress({ ...progress });
        }
      }
      
      // Delay between batches (but not after the last batch)
      if (i + finalConfig.batchSize < items.length) {
        console.log(`[ParallelEngine] Waiting ${finalConfig.batchDelay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, finalConfig.batchDelay));
      }
    }
    
    // Retry failed items if configured
    if (finalConfig.retryFailedItems && failedItems.length > 0) {
      console.log(`[ParallelEngine] Retrying ${failedItems.length} failed items...`);
      
      for (const { item, attempts } of failedItems) {
        if (attempts >= finalConfig.maxRetries) continue;
        
        const startTime = Date.now();
        try {
          const result = await processor(item);
          const duration = Date.now() - startTime;
          
          // Update the result in the results array
          const index = results.findIndex(r => r.item === item);
          if (index !== -1) {
            results[index] = {
              item,
              success: true,
              result,
              attempts: attempts + 1,
              duration,
            };
            progress.successful++;
            progress.failed--;
          }
        } catch (error: any) {
          console.error(`[ParallelEngine] Retry failed for item:`, error.message);
        }
      }
    }
    
    console.log(`[ParallelEngine] Completed: ${progress.successful}/${progress.total} successful, ${progress.failed} failed`);
    
    return results;
  }

  /**
   * Process items with priority queue support
   */
  async processWithPriority<T>(
    queues: PriorityQueueItem<T>[],
    processor: (item: T) => Promise<any>,
    config: Partial<ParallelConfig> = {}
  ): Promise<ProcessingResult<T>[]> {
    // Sort by priority (highest first)
    const sortedItems = queues
      .sort((a, b) => b.priority - a.priority)
      .map(q => q.item);
    
    return this.processBatch(sortedItems, processor, config);
  }

  /**
   * Process items with controlled concurrency
   */
  private async processConcurrent<T>(
    items: T[],
    processor: (item: T) => Promise<any>,
    maxConcurrency: number
  ): Promise<ProcessingResult<T>[]> {
    const results: ProcessingResult<T>[] = [];
    const executing: Promise<void>[] = [];
    
    for (const item of items) {
      const promise = this.processItem(item, processor).then(result => {
        results.push(result);
      });
      
      executing.push(promise);
      
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const p = executing[i];
          if (await Promise.race([p.then(() => true), Promise.resolve(false)])) {
            executing.splice(i, 1);
          }
        }
      }
    }
    
    // Wait for remaining items to complete
    await Promise.all(executing);
    
    return results;
  }

  /**
   * Process a single item with timing and error handling
   */
  private async processItem<T>(
    item: T,
    processor: (item: T) => Promise<any>
  ): Promise<ProcessingResult<T>> {
    const startTime = Date.now();
    
    try {
      const result = await processor(item);
      const duration = Date.now() - startTime;
      
      return {
        item,
        success: true,
        result,
        attempts: 1,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      return {
        item,
        success: false,
        error: error.message || 'Unknown error',
        attempts: 1,
        duration,
      };
    }
  }

  /**
   * Utility: Chunk an array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Export singleton instance
export const parallelEngine = new ParallelEngine();
