/**
 * Etsy API Request Budget
 * Persistent daily request counter with header-aware limits and per-second throttle.
 *
 * - Etsy day resets at UTC midnight.
 * - Hard cap = min(ETSY_DAILY_BUDGET env, X-Limit-Per-Day response header).
 *   Default 4000 (20% headroom under Etsy's standard 5,000/day). Provisional
 *   keys may carry LOWER limits — the header always wins when lower.
 * - Per-second throttle: stay at <=5 req/s (Etsy default allows 10).
 * - Counter survives restarts via JSON state file (matches repo conventions:
 *   trendStore/keywordStore persist JSON under data/trends/).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data/trends');
const STATE_FILE = path.join(DATA_DIR, 'etsy-budget.json');

const DEFAULT_DAILY_BUDGET = 4000;
const MAX_REQUESTS_PER_SECOND = 5;
const MIN_REQUEST_INTERVAL_MS = Math.ceil(1000 / MAX_REQUESTS_PER_SECOND);

interface EtsyBudgetState {
  /** UTC day this state belongs to, YYYY-MM-DD */
  date: string;
  /** Requests sent today (our own count) */
  used: number;
  /** Last X-Limit-Per-Day seen from Etsy (null until first response) */
  headerLimitPerDay: number | null;
  /** Last X-Remaining-This-Day seen from Etsy */
  headerRemainingToday: number | null;
  /** ISO timestamp of last request */
  lastRequestAt: string | null;
}

export interface EtsyBudgetStatus {
  date: string;
  requestsToday: number;
  dailyCap: number;
  remainingBudget: number;
  envBudget: number;
  headerLimitPerDay: number | null;
  headerRemainingToday: number | null;
  exhausted: boolean;
  lastRequestAt: string | null;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

class EtsyBudget {
  private state: EtsyBudgetState;
  private lastRequestMs = 0;

  constructor() {
    this.state = this.load();
  }

  private envBudget(): number {
    const raw = process.env.ETSY_DAILY_BUDGET;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_BUDGET;
  }

  private load(): EtsyBudgetState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as EtsyBudgetState;
        if (parsed && typeof parsed.used === 'number' && typeof parsed.date === 'string') {
          return parsed;
        }
      }
    } catch (error: any) {
      console.error('[EtsyBudget] Failed to load state, starting fresh:', error.message);
    }
    return {
      date: utcToday(),
      used: 0,
      headerLimitPerDay: null,
      headerRemainingToday: null,
      lastRequestAt: null,
    };
  }

  private save(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error: any) {
      console.error('[EtsyBudget] Failed to persist state:', error.message);
    }
  }

  /** Reset the counter when the UTC day has rolled over. */
  private rolloverIfNeeded(): void {
    const today = utcToday();
    if (this.state.date !== today) {
      console.log(`[EtsyBudget] UTC day rollover ${this.state.date} -> ${today}, resetting counter (was ${this.state.used})`);
      this.state = {
        date: today,
        used: 0,
        // Keep the last known per-day limit; remaining resets with the day.
        headerLimitPerDay: this.state.headerLimitPerDay,
        headerRemainingToday: null,
        lastRequestAt: null,
      };
      this.save();
    }
  }

  /** Effective daily cap: the LOWER of env budget and header-reported limit. */
  getDailyCap(): number {
    const env = this.envBudget();
    const header = this.state.headerLimitPerDay;
    return header !== null && header < env ? header : env;
  }

  /**
   * Whether another request is allowed right now.
   * Trusts the LOWER of our own counter vs Etsy's X-Remaining-This-Day.
   */
  canRequest(): boolean {
    this.rolloverIfNeeded();
    if (this.state.used >= this.getDailyCap()) return false;
    if (this.state.headerRemainingToday !== null && this.state.headerRemainingToday <= 0) return false;
    return true;
  }

  /** Async per-second throttle. Resolves when it is safe to fire the next request. */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestMs;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    this.lastRequestMs = Date.now();
  }

  /**
   * Record a sent request and absorb Etsy rate-limit headers from the response.
   * Headers are authoritative when LOWER than what we believe.
   */
  recordRequest(headers?: Headers): void {
    this.rolloverIfNeeded();
    this.state.used++;
    this.state.lastRequestAt = new Date().toISOString();

    if (headers) {
      const limit = parseInt(headers.get('x-limit-per-day') || '', 10);
      const remaining = parseInt(headers.get('x-remaining-this-day') || '', 10);
      if (Number.isFinite(limit) && limit > 0) {
        this.state.headerLimitPerDay = limit;
      }
      if (Number.isFinite(remaining)) {
        this.state.headerRemainingToday = remaining;
      }
    }

    this.save();
  }

  getStatus(): EtsyBudgetStatus {
    this.rolloverIfNeeded();
    const dailyCap = this.getDailyCap();
    const remainingByCounter = Math.max(0, dailyCap - this.state.used);
    const remainingBudget = this.state.headerRemainingToday !== null
      ? Math.min(remainingByCounter, Math.max(0, this.state.headerRemainingToday))
      : remainingByCounter;

    return {
      date: this.state.date,
      requestsToday: this.state.used,
      dailyCap,
      remainingBudget,
      envBudget: this.envBudget(),
      headerLimitPerDay: this.state.headerLimitPerDay,
      headerRemainingToday: this.state.headerRemainingToday,
      exhausted: !this.canRequest(),
      lastRequestAt: this.state.lastRequestAt,
    };
  }
}

export const etsyBudget = new EtsyBudget();
