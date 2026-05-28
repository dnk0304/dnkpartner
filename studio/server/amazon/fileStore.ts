import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * File-based persistence utility for Amazon data stores
 * Handles JSON serialization with Date objects and debounced writes
 */

// Ensure data directory exists - using new scrapers/amazon structure
const DATA_DIR = path.join(__dirname, '../../data/scrapers/amazon');

// Create directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[FileStore] Created data directory: ${DATA_DIR}`);
}

/**
 * Debounced write manager
 * Batches multiple write requests to reduce disk I/O
 */
class DebouncedWriter {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_DELAY = 1000; // 1 second

  /**
   * Schedule a debounced write operation
   */
  write(filename: string, data: any, delay: number = this.DEFAULT_DELAY): void {
    // Clear existing timer for this file
    const existingTimer = this.timers.get(filename);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new write
    const timer = setTimeout(() => {
      this.executeWrite(filename, data);
      this.timers.delete(filename);
    }, delay);

    this.timers.set(filename, timer);
  }

  /**
   * Execute the actual file write
   */
  private executeWrite(filename: string, data: any): void {
    try {
      const filepath = path.join(DATA_DIR, filename);
      const json = JSON.stringify(data, this.dateReplacer, 2);
      
      // Write to temporary file first, then rename for atomicity
      const tempPath = `${filepath}.tmp`;
      fs.writeFileSync(tempPath, json, 'utf8');
      fs.renameSync(tempPath, filepath);
      
      console.log(`[FileStore] Saved ${filename} (${json.length} bytes)`);
    } catch (error) {
      console.error(`[FileStore] Failed to write ${filename}:`, error);
    }
  }

  /**
   * JSON replacer function to handle Date objects
   */
  private dateReplacer(key: string, value: any): any {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    return value;
  }

  /**
   * Force immediate write (bypass debounce)
   */
  writeImmediate(filename: string, data: any): void {
    // Clear any pending timer
    const existingTimer = this.timers.get(filename);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(filename);
    }

    this.executeWrite(filename, data);
  }

  /**
   * Flush all pending writes
   */
  flushAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

// Global debounced writer instance
const writer = new DebouncedWriter();

/**
 * JSON reviver function to restore Date objects
 */
function dateReviver(key: string, value: any): any {
  if (value && typeof value === 'object' && value.__type === 'Date') {
    return new Date(value.value);
  }
  return value;
}

/**
 * Save data to a JSON file with debouncing
 */
export function saveJSON(filename: string, data: any, immediate: boolean = false): void {
  if (immediate) {
    writer.writeImmediate(filename, data);
  } else {
    writer.write(filename, data);
  }
}

/**
 * Load data from a JSON file
 * Returns null if file doesn't exist or is invalid
 */
export function loadJSON<T>(filename: string): T | null {
  try {
    const filepath = path.join(DATA_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      console.log(`[FileStore] File not found: ${filename}`);
      return null;
    }

    const json = fs.readFileSync(filepath, 'utf8');
    const data = JSON.parse(json, dateReviver);
    
    console.log(`[FileStore] Loaded ${filename} (${json.length} bytes)`);
    return data as T;
  } catch (error) {
    console.error(`[FileStore] Failed to load ${filename}:`, error);
    return null;
  }
}

/**
 * Check if a file exists
 */
export function fileExists(filename: string): boolean {
  const filepath = path.join(DATA_DIR, filename);
  return fs.existsSync(filepath);
}

/**
 * Delete a file
 */
export function deleteFile(filename: string): boolean {
  try {
    const filepath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`[FileStore] Deleted ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[FileStore] Failed to delete ${filename}:`, error);
    return false;
  }
}

/**
 * Get file size in bytes
 */
export function getFileSize(filename: string): number {
  try {
    const filepath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      return stats.size;
    }
    return 0;
  } catch (error) {
    console.error(`[FileStore] Failed to get file size for ${filename}:`, error);
    return 0;
  }
}

/**
 * Flush all pending writes (useful on shutdown)
 */
export function flushAll(): void {
  writer.flushAll();
}

/**
 * Get the data directory path
 */
export function getDataDir(): string {
  return DATA_DIR;
}

