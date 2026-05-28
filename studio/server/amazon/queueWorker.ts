import { v4 as uuidv4 } from 'uuid';
import { ScrapeJob, JobType, JobStatus, ScrapeResult, ASINDetails } from './types';
import { amazonScraper } from './scraper';

/**
 * In-memory job queue for rate-limited Amazon scraping
 * Includes circuit breaker and smart retry logic
 */
class QueueWorker {
  private queue: ScrapeJob[] = [];
  private processing = false;
  private readonly RATE_LIMIT_MS = 2500; // 2.5 seconds between requests
  private readonly MAX_RETRIES = 3;
  private lastProcessTime = 0;
  
  // Circuit breaker
  private circuitBreakerFailures = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private circuitBreakerResetTime: number | null = null;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  /**
   * Add a job to the queue
   */
  enqueue(type: JobType, payload: ScrapeJob['payload']): string {
    const job: ScrapeJob = {
      id: uuidv4(),
      type,
      payload,
      status: 'pending',
      retries: 0,
      maxRetries: this.MAX_RETRIES,
      createdAt: new Date(),
    };

    this.queue.push(job);
    
    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    return job.id;
  }

  /**
   * Get job status by ID
   */
  getJobStatus(jobId: string): ScrapeJob | undefined {
    return this.queue.find((job) => job.id === jobId);
  }

  /**
   * Get all jobs with a specific status
   */
  getJobsByStatus(status: JobStatus): ScrapeJob[] {
    return this.queue.filter((job) => job.status === status);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerResetTime && Date.now() > this.circuitBreakerResetTime) {
      // Reset circuit breaker
      console.log('⚡ [QueueWorker] Circuit breaker reset');
      this.circuitBreakerFailures = 0;
      this.circuitBreakerResetTime = null;
      return false;
    }
    
    return this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD;
  }

  /**
   * Categorize error for smart retry
   */
  private categorizeError(error: string): 'retryable' | 'permanent' | 'captcha' {
    const lowerError = error.toLowerCase();
    
    // CAPTCHA - don't retry immediately
    if (lowerError.includes('captcha')) {
      return 'captcha';
    }
    
    // Permanent errors - don't retry
    const permanentErrors = ['404', 'not found', 'invalid asin', 'invalid keyword'];
    if (permanentErrors.some(err => lowerError.includes(err))) {
      return 'permanent';
    }
    
    // Everything else is retryable
    return 'retryable';
  }

  /**
   * Get retry delay based on error type and attempt
   */
  private getRetryDelay(errorType: 'retryable' | 'permanent' | 'captcha', retries: number): number {
    if (errorType === 'permanent') {
      return 0; // No retry
    }
    
    if (errorType === 'captcha') {
      // Longer delay for CAPTCHA
      return Math.pow(2, retries) * 5000; // 5s, 10s, 20s...
    }
    
    // Standard exponential backoff for retryable errors
    return Math.pow(2, retries) * 1000; // 1s, 2s, 4s, 8s...
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      total: this.queue.length,
      pending: this.queue.filter((j) => j.status === 'pending').length,
      processing: this.queue.filter((j) => j.status === 'processing').length,
      completed: this.queue.filter((j) => j.status === 'completed').length,
      failed: this.queue.filter((j) => j.status === 'failed').length,
      isProcessing: this.processing,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
      circuitBreakerFailures: this.circuitBreakerFailures,
    };
  }

  /**
   * Wait for rate limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;
    
    if (timeSinceLastProcess < this.RATE_LIMIT_MS) {
      const waitTime = this.RATE_LIMIT_MS - timeSinceLastProcess;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    
    this.lastProcessTime = Date.now();
  }

  /**
   * Process a single job
   */
  private async processJob(job: ScrapeJob): Promise<void> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn(`⚠️ [QueueWorker] Circuit breaker open, requeueing job ${job.id}`);
      job.status = 'pending';
      return;
    }
    
    job.status = 'processing';
    job.startedAt = new Date();

    try {
      let result: ScrapeResult | ASINDetails;

      switch (job.type) {
        case 'KEYWORD_SNAPSHOT':
          if (!job.payload.keyword) {
            throw new Error('Keyword is required for KEYWORD_SNAPSHOT job');
          }
          result = await amazonScraper.scrapeKeyword(
            job.payload.keyword,
            job.payload.marketplace
          );
          break;

        case 'ASIN_LOOKUP':
          if (!job.payload.asin) {
            throw new Error('ASIN is required for ASIN_LOOKUP job');
          }
          result = await amazonScraper.scrapeASIN(
            job.payload.asin,
            job.payload.marketplace
          );
          break;

        case 'RANK_CHECK':
          // For rank check, we just need to scrape the keyword and extract ranks
          if (!job.payload.keyword) {
            throw new Error('Keyword is required for RANK_CHECK job');
          }
          result = await amazonScraper.scrapeKeyword(
            job.payload.keyword,
            job.payload.marketplace
          );
          break;

        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.result = result;
      job.status = 'completed';
      job.completedAt = new Date();
      
      // Reset circuit breaker on success
      if (this.circuitBreakerFailures > 0) {
        this.circuitBreakerFailures = Math.max(0, this.circuitBreakerFailures - 1);
      }
      
      console.log(`✅ [QueueWorker] Job ${job.id} completed successfully (${job.type})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [QueueWorker] Job ${job.id} failed:`, errorMessage);

      // Categorize error
      const errorType = this.categorizeError(errorMessage);
      
      // Increment circuit breaker for retryable errors
      if (errorType === 'retryable' || errorType === 'captcha') {
        this.circuitBreakerFailures++;
        
        if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
          this.circuitBreakerResetTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
          console.warn(`⚡ [QueueWorker] Circuit breaker opened after ${this.circuitBreakerFailures} failures`);
        }
      }

      job.retries++;
      
      // Determine if we should retry
      if (errorType === 'permanent' || job.retries >= job.maxRetries) {
        job.status = 'failed';
        job.error = errorMessage;
        job.completedAt = new Date();
        console.error(`❌ [QueueWorker] Job ${job.id} failed permanently (${errorType}): ${errorMessage}`);
      } else {
        // Retry with smart delay
        job.status = 'pending';
        const retryDelay = this.getRetryDelay(errorType, job.retries);
        
        console.log(
          `🔄 [QueueWorker] Job ${job.id} will retry in ${retryDelay}ms ` +
          `(attempt ${job.retries + 1}/${job.maxRetries}, type: ${errorType})`
        );
        
        // Wait for backoff, then re-add to queue
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Start processing the queue
   */
  private async startProcessing(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    console.log('Queue worker started');

    while (this.queue.length > 0) {
      // Find next pending job
      const nextJob = this.queue.find((job) => job.status === 'pending');
      
      if (!nextJob) {
        // No pending jobs, wait a bit and check again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // If still no pending jobs, stop processing
        if (!this.queue.find((job) => job.status === 'pending')) {
          break;
        }
        continue;
      }

      // Wait for rate limit before processing
      await this.waitForRateLimit();

      // Process the job
      await this.processJob(nextJob);
    }

    this.processing = false;
    console.log('Queue worker stopped');
    
    // Clean up old completed/failed jobs (keep last 100)
    this.cleanupOldJobs();
  }

  /**
   * Clean up old jobs to prevent memory leaks
   */
  private cleanupOldJobs(): void {
    const maxJobs = 100;
    if (this.queue.length > maxJobs) {
      // Sort by completion time and keep only the most recent
      const sortedJobs = this.queue
        .filter((job) => job.status === 'completed' || job.status === 'failed')
        .sort((a, b) => {
          const timeA = a.completedAt?.getTime() || 0;
          const timeB = b.completedAt?.getTime() || 0;
          return timeB - timeA;
        });

      const pendingJobs = this.queue.filter(
        (job) => job.status === 'pending' || job.status === 'processing'
      );

      this.queue = [...pendingJobs, ...sortedJobs.slice(0, maxJobs - pendingJobs.length)];
      
      console.log(`Cleaned up old jobs. Queue size: ${this.queue.length}`);
    }
  }

  /**
   * Clear all completed and failed jobs
   */
  clearCompleted(): number {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(
      (job) => job.status === 'pending' || job.status === 'processing'
    );
    const removed = initialLength - this.queue.length;
    console.log(`Cleared ${removed} completed/failed jobs`);
    return removed;
  }

  /**
   * Cancel a pending job
   */
  cancelJob(jobId: string): boolean {
    const job = this.queue.find((j) => j.id === jobId);
    if (job && job.status === 'pending') {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      job.completedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Get all jobs (for debugging)
   */
  getAllJobs(): ScrapeJob[] {
    return [...this.queue];
  }
}

// Export singleton instance
export const queueWorker = new QueueWorker();

