/**
 * Smoke-only loader registration: redirects `node:child_process` imports to a
 * synthetic module whose `spawn` is a fake `claude`, so llm.ts's
 * `import { spawn } from 'node:child_process'` named binding resolves to the
 * fake WITHOUT editing production code. ESM-correct (named bindings honor it).
 * Scoped to the smoke child (registered via --import); never the app.
 */
import { register } from 'node:module';
register('./_forge_cp_mock_loader.mjs', import.meta.url);
