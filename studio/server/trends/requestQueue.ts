/**
 * Persistent Request Queue
 * JSON-based queue with priority support, automatic retries, and dead letter queue
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data/trends');
const QUEUE_FILE = path.join(DATA_DIR, 'request-queue.json');
const DLQ_FILE = path.join(DATA_DIR, 'dead-letter-queue.json');

export interface QueuedRequest {
  id: string;
  type: 'search' | 'product' | 'trend' | 'category';
  platform: string;
  payload: any;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastAttempt: string | null;
  nextRetryAt: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  error?: string;
}

interface QueueData {
  requests: QueuedRequest[];
  stats: {
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    deadCount: number;
    lastUpdate: string;
  };
  version: string;
}

export class RequestQueue {
  private data: QueueData;
  private isDirty: boolean = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private saveDebounceDelay = 5000; // 5 seconds

  constructor() {
    this.data = this.loadData();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Load queue data from disk
   */
  private loadData(): QueueData {
    this.ensureDataDir();
    
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const content = fs.readFileSync(QUEUE_FILE, 'utf-8');
        const data = JSON.parse(content);
        console.log(`[RequestQueue] Loaded ${data.requests.length} requests`);
        return data;
      }
    } catch (error) {
      console.error('[RequestQueue] Error loading data:', error);
    }

    return {
      requests: [],
      stats: {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
        deadCount: 0,
        lastUpdate: new Date().toISOString(),
      },
      version: '1.0.0',
    };
  }

  /**
   * Save queue data to disk (debounced)
   */
  private saveData(): void {
    this.isDirty = true;
    
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(() => {
      if (this.isDirty) {
        try {
          this.ensureDataDir();
          
          // Update stats
          this.data.stats.lastUpdate = new Date().toISOString();
          
          fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.data, null, 2));
          this.isDirty = false;
          console.log(`[RequestQueue] Saved ${this.data.requests.length} requests`);
        } catch (error) {
          console.error('[RequestQueue] Error saving data:', error);
        }
      }
    }, this.saveDebounceDelay);
  }

  /**
   * Add a request to the queue
   */
  enqueue(request: Omit<QueuedRequest, 'id' | 'createdAt' | 'lastAttempt' | 'nextRetryAt' | 'status' | 'attempts'>): string {
    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedRequest: QueuedRequest = {
      ...request,
      id,
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastAttempt: null,
      nextRetryAt: null,
      status: 'pending',
    };
    
    this.data.requests.push(queuedRequest);
    this.saveData();
    
    console.log(`[RequestQueue] Enqueued ${request.type} request for ${request.platform} (priority: ${request.priority})`);
    
    return id;
  }

  /**
   * Get next request from queue (respects priority)
   */
  dequeue(): QueuedRequest | null {
    const now = Date.now();
    
    // Find pending requests that are ready to process
    const readyRequests = this.data.requests.filter(req => 
      req.status === 'pending' &&
      (req.nextRetryAt === null || new Date(req.nextRetryAt).getTime() <= now)
    );
    
    if (readyRequests.length === 0) {
      return null;
    }
    
    // Sort by priority (HIGH > NORMAL > LOW)
    const priorityOrder = { HIGH: 3, NORMAL: 2, LOW: 1 };
    readyRequests.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, older first
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    
    const request = readyRequests[0];
    request.status = 'processing';
    request.lastAttempt = new Date().toISOString();
    request.attempts++;
    
    this.saveData();
    
    return request;
  }

  /**
   * Mark request as completed
   */
  complete(requestId: string, result?: any): void {
    const request = this.data.requests.find(r => r.id === requestId);
    if (!request) return;
    
    request.status = 'completed';
    this.data.stats.totalProcessed++;
    this.data.stats.successCount++;
    
    // Remove completed requests after 24 hours (keep queue size manageable)
    setTimeout(() => {
      this.data.requests = this.data.requests.filter(r => r.id !== requestId);
      this.saveData();
    }, 24 * 60 * 60 * 1000);
    
    this.saveData();
  }

  /**
   * Mark request as failed (with retry logic)
   */
  fail(requestId: string, error: string): void {
    const request = this.data.requests.find(r => r.id === requestId);
    if (!request) return;
    
    request.error = error;
    
    if (request.attempts >= request.maxAttempts) {
      // Move to dead letter queue
      this.moveToDLQ(request);
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(
        1000 * Math.pow(2, request.attempts), // Exponential backoff
        60 * 60 * 1000 // Max 1 hour
      );
      
      request.status = 'pending';
      request.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      
      console.log(`[RequestQueue] Scheduling retry for ${requestId} in ${Math.round(backoffMs / 1000)}s (attempt ${request.attempts}/${request.maxAttempts})`);
    }
    
    this.data.stats.totalProcessed++;
    this.data.stats.failureCount++;
    this.saveData();
  }

  /**
   * Move request to dead letter queue
   */
  private moveToDLQ(request: QueuedRequest): void {
    request.status = 'dead';
    
    this.data.stats.deadCount++;
    
    // Load DLQ
    let dlqData: { requests: QueuedRequest[] } = { requests: [] };
    try {
      if (fs.existsSync(DLQ_FILE)) {
        const content = fs.readFileSync(DLQ_FILE, 'utf-8');
        dlqData = JSON.parse(content);
      }
    } catch (error) {
      console.error('[RequestQueue] Error loading DLQ:', error);
    }
    
    // Add to DLQ
    dlqData.requests.push(request);
    
    // Save DLQ
    try {
      this.ensureDataDir();
      fs.writeFileSync(DLQ_FILE, JSON.stringify(dlqData, null, 2));
      console.log(`[RequestQueue] Moved ${request.id} to DLQ after ${request.attempts} failed attempts`);
    } catch (error) {
      console.error('[RequestQueue] Error saving DLQ:', error);
    }
    
    // Remove from main queue
    this.data.requests = this.data.requests.filter(r => r.id !== request.id);
    this.saveData();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const pending = this.data.requests.filter(r => r.status === 'pending').length;
    const processing = this.data.requests.filter(r => r.status === 'processing').length;
    const completed = this.data.requests.filter(r => r.status === 'completed').length;
    const failed = this.data.requests.filter(r => r.status === 'failed').length;
    
    return {
      ...this.data.stats,
      currentQueue: {
        pending,
        processing,
        completed,
        failed,
        total: this.data.requests.length,
      },
    };
  }

  /**
   * Get all pending requests
   */
  getPendingRequests(): QueuedRequest[] {
    return this.data.requests.filter(r => r.status === 'pending');
  }

  /**
   * Clear completed requests
   */
  clearCompleted(): number {
    const completedCount = this.data.requests.filter(r => r.status === 'completed').length;
    this.data.requests = this.data.requests.filter(r => r.status !== 'completed');
    this.saveData();
    
    console.log(`[RequestQueue] Cleared ${completedCount} completed requests`);
    return completedCount;
  }

  /**
   * Clear all requests
   */
  clearAll(): void {
    this.data.requests = [];
    this.saveData();
    console.log('[RequestQueue] Cleared all requests');
  }

  /**
   * Retry a request from DLQ
   */
  retryFromDLQ(requestId: string): boolean {
    try {
      if (!fs.existsSync(DLQ_FILE)) return false;
      
      const content = fs.readFileSync(DLQ_FILE, 'utf-8');
      const dlqData: { requests: QueuedRequest[] } = JSON.parse(content);
      
      const request = dlqData.requests.find(r => r.id === requestId);
      if (!request) return false;
      
      // Reset request
      request.status = 'pending';
      request.attempts = 0;
      request.nextRetryAt = null;
      request.error = undefined;
      
      // Add back to main queue
      this.data.requests.push(request);
      this.saveData();
      
      // Remove from DLQ
      dlqData.requests = dlqData.requests.filter(r => r.id !== requestId);
      fs.writeFileSync(DLQ_FILE, JSON.stringify(dlqData, null, 2));
      
      console.log(`[RequestQueue] Retried ${requestId} from DLQ`);
      return true;
    } catch (error) {
      console.error('[RequestQueue] Error retrying from DLQ:', error);
      return false;
    }
  }
}

// Export singleton instance
export const requestQueue = new RequestQueue();
