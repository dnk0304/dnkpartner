/**
 * Shared snapshot store — DNK Trends Phase 1 (2026-06-13).
 *
 * Persists TrendSignal rows on the persistent volume:
 *   /app/data/trends/snapshots/<platform>/<UTC-date>.json   (array of TrendSignal)
 *
 * The host bind mount is /data/dnkstudio/trends -> /app/data/trends, so
 * anything written here survives redeploys. All durable trend state MUST go
 * through this module (or another data/trends path) — never under
 * data/scrapers/, which lives inside the image and is wiped on redeploy.
 *
 * Phase 2/3 source builders: call appendSignals() per pull and you are done.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTrendSignal, type TrendPlatform, type TrendSignal } from './signalSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/trends/../../data/trends -> /app/data/trends in the container
// (same resolution pattern as etsyBudget.ts / keywordStore.ts / trendStore.ts).
const DATA_DIR = path.join(__dirname, '../../data/trends');
const SNAPSHOT_ROOT = path.join(DATA_DIR, 'snapshots');

const DAY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

function platformDir(platform: string): string {
  return path.join(SNAPSHOT_ROOT, platform);
}

function dayFile(platform: string, utcDate: string): string {
  return path.join(platformDir(platform), `${utcDate}.json`);
}

function readSignalFile(file: string): TrendSignal[] {
  try {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrendSignal);
  } catch {
    // Corrupt file: surface nothing rather than crash readers.
    return [];
  }
}

class SnapshotStore {
  /** Root directory (exposed for health/diagnostics). */
  get rootDir(): string {
    return SNAPSHOT_ROOT;
  }

  /**
   * Append signals from one pull to the platform's current UTC-day file.
   * Synchronous (single-writer-per-platform scheduler), fail-soft: a storage
   * error must never abort a collection run.
   */
  appendSignals(platform: TrendPlatform, signals: TrendSignal[]): void {
    if (signals.length === 0) return;
    try {
      const dir = platformDir(platform);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const utcDate = new Date().toISOString().slice(0, 10);
      const file = dayFile(platform, utcDate);
      const existing = readSignalFile(file);
      existing.push(...signals);

      // Atomic-ish write: temp file + rename, so a crash mid-write never
      // leaves a truncated day file behind.
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(existing));
      fs.renameSync(tmp, file);
    } catch (error: any) {
      console.error(`[SnapshotStore] Failed to append ${platform} signals:`, error.message);
    }
  }

  /** UTC dates (sorted ascending) that have a snapshot file for a platform. */
  listDays(platform: TrendPlatform): string[] {
    try {
      const dir = platformDir(platform);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => DAY_FILE_RE.test(f))
        .map(f => f.slice(0, 10))
        .sort();
    } catch {
      return [];
    }
  }

  /** All signals for one platform on one UTC date. */
  readDay(platform: TrendPlatform, utcDate: string): TrendSignal[] {
    return readSignalFile(dayFile(platform, utcDate));
  }

  /** Platforms that have at least one snapshot day on disk. */
  listPlatformsWithData(): string[] {
    try {
      if (!fs.existsSync(SNAPSHOT_ROOT)) return [];
      return fs.readdirSync(SNAPSHOT_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .filter(name => this.listDays(name as TrendPlatform).length > 0)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Signals for a platform across the most recent `maxDays` snapshot days,
   * sorted by capturedAt ascending.
   */
  readRecentSignals(platform: TrendPlatform, maxDays = 30): TrendSignal[] {
    const days = this.listDays(platform).slice(-maxDays);
    const out: TrendSignal[] = [];
    for (const day of days) out.push(...this.readDay(platform, day));
    return out.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  /**
   * Cross-platform series for one keyword (case-insensitive exact match),
   * sorted ascending per platform. Mock rows are EXCLUDED unless explicitly
   * requested — the /api/trends/signal contract is zero mock leakage.
   */
  getSignalsForKeyword(
    keyword: string,
    options: { maxDays?: number; includeMock?: boolean } = {}
  ): Record<string, TrendSignal[]> {
    const { maxDays = 30, includeMock = false } = options;
    const needle = keyword.trim().toLowerCase();
    const result: Record<string, TrendSignal[]> = {};

    for (const platform of this.listPlatformsWithData()) {
      const series = this.readRecentSignals(platform as TrendPlatform, maxDays).filter(
        s => s.keyword.trim().toLowerCase() === needle && (includeMock || !s.isMock)
      );
      if (series.length > 0) result[platform] = series;
    }
    return result;
  }

  /**
   * Most recent capturedAt for a platform. realOnly (default) ignores mock
   * rows so health freshness reflects real data only.
   */
  getLastSignalAt(platform: TrendPlatform, options: { realOnly?: boolean } = {}): string | null {
    const { realOnly = true } = options;
    const days = this.listDays(platform);
    // Walk newest day backwards; first qualifying row wins.
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i];
      if (!day) continue;
      const rows = this.readDay(platform, day).filter(s => !realOnly || !s.isMock);
      if (rows.length > 0) {
        let latest = rows[0]!.capturedAt;
        for (const r of rows) if (r.capturedAt > latest) latest = r.capturedAt;
        return latest;
      }
    }
    return null;
  }
}

export const snapshotStore = new SnapshotStore();
export { SNAPSHOT_ROOT };
