/**
 * Standalone dispatcher worker (Wave 2b).
 *
 * Run with: `npm run worker:dispatcher`
 *           or: `tsx scripts/run-dispatcher.ts`
 *
 * Loops forever, draining `event_outbox` every DISPATCHER_INTERVAL_MS (default
 * 10s). Designed to run as its own container (`dnksubastas-dispatcher`) in the
 * Coolify deploy. SIGTERM-aware so docker stop drains in <2s.
 *
 * Multiple instances are SAFE — claim uses FOR UPDATE SKIP LOCKED so each row
 * is processed by exactly one worker; in-app/email/push delivery dedupes on
 * (dedupeKey, userId, channel) via Notification.payload.__dedupe.
 */
import { drainOutbox } from '@/lib/dispatcher';

const INTERVAL = Number(process.env.DISPATCHER_INTERVAL_MS ?? 10_000);
const BATCH = Number(process.env.DISPATCHER_BATCH_SIZE ?? 50);

let stopping = false;

function log(msg: string, extra?: unknown) {
  const line = extra === undefined ? msg : `${msg} ${JSON.stringify(extra)}`;
  console.log(`[dispatcher ${new Date().toISOString()}] ${line}`);
}

async function loop() {
  log(`starting (interval=${INTERVAL}ms batch=${BATCH})`);
  while (!stopping) {
    try {
      const stats = await drainOutbox(BATCH);
      if (stats.outboxScanned > 0 || stats.errors.length > 0) {
        log('drain', stats);
      }
    } catch (err) {
      log('drain_threw', { error: (err as Error).message });
    }
    await sleep(INTERVAL);
  }
  log('stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function installSignalHandlers() {
  const handle = (sig: NodeJS.Signals) => {
    log(`signal ${sig} received, draining stop`);
    stopping = true;
  };
  process.on('SIGTERM', handle);
  process.on('SIGINT', handle);
}

installSignalHandlers();
loop().catch((err) => {
  log('fatal', { error: (err as Error).message });
  process.exit(1);
});
