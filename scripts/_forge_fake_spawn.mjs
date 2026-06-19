/**
 * Fake `spawn` for the smoke loader. Returns a fake child for any `claude` bin
 * (so llm.ts's spawnClaude consumes it) and delegates everything else to the
 * real spawn. Counts spawns to FORGE_FAKE_COUNTER so the parent asserts call
 * shape. Honors FORGE_FAKE_FAIL_FIRST (flake N), FORGE_FAKE_VERDICT, FORGE_FAKE_SCORE.
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const realSpawn = require('child_process').spawn;

const counterPath = process.env.FORGE_FAKE_COUNTER;
const failFirst = Number(process.env.FORGE_FAKE_FAIL_FIRST ?? '0');

function nextIndex() {
  if (!counterPath) return 1;
  try {
    return readFileSync(counterPath, 'utf8').split('\n').filter((l) => l.trim()).length + 1;
  } catch {
    return 1;
  }
}

function synth(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (schema.enum.includes('PASS') || schema.enum.includes('FAIL')) {
      return process.env.FORGE_FAKE_VERDICT ?? 'PASS';
    }
    return schema.enum[0];
  }
  switch (schema.type) {
    case 'object': {
      const out = {};
      const props = schema.properties ?? {};
      const required = schema.required ?? Object.keys(props);
      for (const k of required) out[k] = synth(props[k]);
      return out;
    }
    case 'array':
      return [synth(schema.items)];
    case 'number':
    case 'integer':
      return Number(process.env.FORGE_FAKE_SCORE ?? '88');
    case 'boolean':
      return true;
    default:
      return 'x';
  }
}

export function fakeSpawn(bin, args, opts) {
  if (!(typeof bin === 'string' && /claude/i.test(bin))) {
    return realSpawn(bin, args, opts);
  }
  const idx = nextIndex();
  if (counterPath) {
    try {
      appendFileSync(counterPath, JSON.stringify({ idx }) + '\n');
    } catch {
      /* ignore */
    }
  }
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  setImmediate(() => {
    if (Number.isFinite(failFirst) && idx <= failFirst) {
      child.emit('close', 1); // transient flake: exit 1, no output
      return;
    }
    const i = (args ?? []).indexOf('--json-schema');
    let schema = {};
    try {
      schema = JSON.parse(i >= 0 ? args[i + 1] : '{}');
    } catch {
      /* ignore */
    }
    const envelope = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      structured_output: synth(schema),
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    child.stdout.emit('data', Buffer.from(JSON.stringify(envelope)));
    child.emit('close', 0);
  });
  return child;
}
