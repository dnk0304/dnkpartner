/**
 * START THE SERVER SUBASTAS ACTUALLY SHIPS.
 *
 * This is the subastas port of dnk-crm's `scripts/audit/lib/standalone-server.mjs`, and the ONE
 * thing that had to change is the thing that module exists to enforce: run the runtime that ships.
 *
 * The CRM sets `output: "standalone"` in next.config, so its shipped entrypoint is
 * `node .next/standalone/server.js`, and GATE-RUNTIME's finding was that three CRM gates spawned
 * `next start` instead and therefore measured a server assembled differently from the image.
 *
 * SUBASTAS IS THE OTHER CASE. `subastas/next.config.ts` sets NO `output` key, and the Dockerfile
 * runtime stage ends:
 *
 *   CMD ["sh","-c","npx prisma migrate deploy && exec node node_modules/next/dist/bin/next start -p 3005 -H 0.0.0.0"]
 *
 * So for THIS app `next start` IS the shipped runtime, and starting a standalone server here would
 * be the identical mistake in mirror image. The lesson was never "always standalone" — it was
 * "measure the configuration you deploy". This module spawns the Dockerfile's exact entrypoint
 * (the bin path, not the `next` shim on PATH) and drops only `prisma migrate deploy`, because the
 * measurement DB is cloned already-migrated and a gate must not mutate schema.
 *
 * ENVIRONMENT. In the container the config arrives as real environment variables and there is no
 * `.env`. `next start` however runs with cwd = the app root, where a `.env` DOES exist and Next
 * would load it. We read it here explicitly and hand it to the child so the value in play is
 * visible to this harness rather than picked up invisibly — and so the gate's own DATABASE_URL,
 * pointed at the isolated measurement database, always wins over any stale line in that file.
 *
 * STDERR IS NEVER SWALLOWED (Ken, binding). Silencing the child's stderr is precisely what hid
 * Next's own runtime warning from the CRM gates for their entire life.
 */

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Parse a dotenv file into a plain object. Comments and blank lines ignored; quotes stripped. */
function readDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return out;
}

/**
 * Assert the arm has a production build before we try to serve it.
 *
 * A missing/stale `.next` is the failure that matters most here: `next start` against a build from
 * the OTHER arm's source would silently produce a two-arm comparison of one arm against itself.
 * BUILD_ID is recorded by the caller and printed in the report so that cannot pass unnoticed.
 */
export function assertBuild(appDir) {
  const buildId = path.join(appDir, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    throw new Error(`no production build in ${appDir}/.next — run: npm run build (in that arm)`);
  }
  return fs.readFileSync(buildId, "utf8").trim();
}

/**
 * Spawn the shipped server for one arm and resolve once it answers.
 *
 * @param {object} opts
 * @param {string} opts.appDir     the arm's `subastas/` directory (cwd for the child)
 * @param {number} opts.port
 * @param {object} [opts.env]      extra env (the gate's DATABASE_URL goes here)
 * @param {string} [opts.label]    prefix for forwarded stderr, so two arms are distinguishable
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.readyPath]
 */
export async function startNextServer({
  appDir,
  port,
  env = {},
  label = "server",
  timeoutMs = 120_000,
  readyPath = "/login",
} = {}) {
  const buildId = assertBuild(appDir);

  // The Dockerfile's exact entrypoint. Resolved through node_modules rather than the `next` shim on
  // PATH: the shim is a different process tree (cmd.exe wrapper on Windows) whose grandchild holds
  // the port, and the pid we get back would not be the listener.
  const bin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(bin)) throw new Error(`next bin not found at ${bin}`);

  const child = spawn(process.execPath, [bin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: appDir,
    // No shell: argv is passed directly, nothing is exposed to shell quoting, and `child.pid` is
    // the real node process rather than a wrapper that orphans its child.
    shell: false,
    env: {
      ...readDotEnv(path.join(appDir, ".env")),
      ...process.env,
      ...env, // the gate's isolated DATABASE_URL wins over any stale .env line
      PORT: String(port),
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrLog = "";
  child.stderr.on("data", (d) => {
    const s = String(d);
    stderrLog += s;
    process.stderr.write(`[${label}] ${s}`);
  });
  let stdoutLog = "";
  child.stdout.on("data", (d) => (stdoutLog += String(d)));

  let exited = null;
  child.on("exit", (code, signal) => (exited = { code, signal }));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `[${label}] server exited (code=${exited.code} signal=${exited.signal}) before serving\n` +
          `--- stderr ---\n${stderrLog}\n--- stdout ---\n${stdoutLog}`
      );
    }
    try {
      const r = await fetch(`http://127.0.0.1:${port}${readyPath}`, { redirect: "manual" });
      if (r.status < 500) {
        child.buildId = buildId;
        child.stderrLog = () => stderrLog;
        return child;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`[${label}] did not come up on :${port} within ${timeoutMs}ms\n--- stderr ---\n${stderrLog}`);
}

/**
 * Kill the SERVER TREE, not just the process we spawned, then verify the PORT is free.
 *
 * The pid is not trustworthy on its own — if the parent chain breaks the node server is reparented
 * and survives, holding the port, and the NEXT run silently measures the PREVIOUS build. With two
 * arms on two ports that failure mode would not merely be stale, it would swap the arms. The port
 * is the real resource, so it is what gets verified.
 */
export function killServer(proc, port) {
  if (proc) {
    if (process.platform === "win32" && proc.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* already gone — the port sweep below covers it */
      }
    }
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  if (process.platform !== "win32" || !port) return;
  for (let i = 0; i < 20; i++) {
    let pids = [];
    try {
      pids = [
        ...new Set(
          execFileSync("netstat", ["-ano"], { encoding: "utf8" })
            .split("\n")
            .filter((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l))
            .map((l) => l.trim().split(/\s+/).pop())
            .filter((p) => p && p !== "0")
        ),
      ];
    } catch {
      return;
    }
    if (pids.length === 0) return;
    for (const pid of pids) {
      try {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* raced with its own exit */
      }
    }
  }
  console.error(`  ⚠ port ${port} still has a LISTENING owner after teardown — kill it before re-running.`);
}
