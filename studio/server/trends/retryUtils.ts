/**
 * Retry Utility with Exponential Backoff
 * Provides robust retry logic for scraping operations
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: any) => void;
}

export class RetryError extends Error {
  public attempts: number;
  public lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        throw new RetryError(
          `Failed after ${maxRetries} attempts: ${error.message}`,
          attempt,
          error
        );
      }

      // Call retry callback
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Wait with exponential backoff
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw new RetryError(
    `Retry logic failed unexpectedly`,
    maxRetries,
    lastError as Error
  );
}

/**
 * Check if error should not be retried
 */
function isNonRetryableError(error: any): boolean {
  // Don't retry on authentication/authorization errors
  if (error.status === 401 || error.status === 403) {
    // Actually, we DO want to retry 403 with different strategies
    return false;
  }

  // Don't retry on client errors (except 429 rate limit)
  if (error.status >= 400 && error.status < 500 && error.status !== 429) {
    // For our use case, we want to retry even 404s with fallback
    return false;
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic and fallback strategies
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ];

  let attemptCount = 0;

  return retryWithBackoff(
    async () => {
      attemptCount++;

      // Rotate user agent on each attempt
      const headers = {
        'User-Agent': userAgents[attemptCount % userAgents.length],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        ...(options.headers || {}),
      };

      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Check if response is ok
      if (!response.ok) {
        const error: any = new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        error.statusText = response.statusText;
        throw error;
      }

      return response;
    },
    {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      onRetry: (attempt, error) => {
        // Don't log 404 errors for Google Shopping (URLs have changed)
        if (!(error.status === 404 && url.includes('google.com/shopping'))) {
          console.log(
            `[Retry] Attempt ${attempt} failed for ${url}: ${error.message}. Retrying...`
          );
        }
      },
      ...retryOptions,
    }
  );
}

/**
 * Rate limiter class to prevent overwhelming servers
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastExecutionTime = 0;

  constructor(
    private minDelay: number = 2000,
    private maxConcurrent: number = 1
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastExecution = now - this.lastExecutionTime;

      if (timeSinceLastExecution < this.minDelay) {
        await sleep(this.minDelay - timeSinceLastExecution);
      }

      const task = this.queue.shift();
      if (task) {
        this.lastExecutionTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

