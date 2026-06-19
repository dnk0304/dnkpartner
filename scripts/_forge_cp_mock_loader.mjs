/**
 * resolve+load hooks: when `node:child_process` / `child_process` is imported,
 * return a synthetic ESM module that re-exports the REAL builtin (obtained via
 * createRequire, no loader loop) but overrides `spawn` with a fake `claude`.
 * Smoke-only (see _forge_cp_mock_register.mjs).
 */
const SHIM_URL = 'forge-cp-shim:child_process';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'node:child_process' || specifier === 'child_process') {
    return { url: SHIM_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === SHIM_URL) {
    const helper = new URL('./_forge_fake_spawn.mjs', import.meta.url).href;
    // The real builtin is pulled via createRequire INSIDE the synthetic module,
    // so we never re-enter this loader for it. We then re-export its surface.
    const source = `
      import { createRequire } from 'node:module';
      import { fakeSpawn } from ${JSON.stringify(helper)};
      const require = createRequire(${JSON.stringify(import.meta.url)});
      const real = require('child_process');
      export const spawn = fakeSpawn;
      export const exec = real.exec;
      export const execFile = real.execFile;
      export const execFileSync = real.execFileSync;
      export const execSync = real.execSync;
      export const spawnSync = real.spawnSync;
      export const fork = real.fork;
      export const ChildProcess = real.ChildProcess;
      export default real;
    `;
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
