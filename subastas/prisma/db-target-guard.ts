/**
 * ============================================================================
 * DESTRUCTIVE PRISMA COMMANDS REFUSE TO RUN OUTSIDE A KNOWN DEV TARGET
 * ============================================================================
 *
 * PORTED, NOT REINVENTED. This is the SEC-CREDS seed guard from the dnk-crm
 * repo (`prisma/seed-guard.ts`, 2026-08-01) applied to a second instance of the
 * same bug class, on Ken's instruction (2026-08-04): *"guard `prisma db push`
 * exactly like db seed was guarded — REUSE the SEC-CREDS machinery, don't
 * invent a second one."* Same allowlist, same two signals, same no-escape-hatch
 * rule, same pure-function shape. Only the command set and the blast-radius
 * description differ. If you fix a flaw here, fix it there too.
 *
 * WHY THIS EXISTS HERE. `auction_url_v3` holds 192,589 minted permanent URLs.
 * It was created by raw DDL and was, for a time, absent from schema.prisma —
 * i.e. UNKNOWN to Prisma. `prisma db push` drops tables the schema does not
 * declare. One command, run against production by someone who believed they
 * were pointed at dev, would have silently destroyed the entire URL scheme.
 *
 * Registering the model in schema.prisma (see `AuctionUrlV3`) fixes THE TABLE.
 * This guard fixes THE CLASS: the next unmanaged table nobody remembered to
 * declare is protected before it is written, not after it is lost.
 *
 * POSITIVE ALLOWLIST, NOT A BLOCKLIST: a destructive command runs only when the
 * target can be affirmatively PROVEN to be a dev database. Anything unproven —
 * new, unknown, unparseable, misconfigured — is refused. Fail closed.
 *
 * TWO INDEPENDENT SIGNALS, either one refuses:
 *   1. DATABASE_URL host must be loopback. Production reaches Postgres over a
 *      docker service name / private IP (10.0.1.x), which can never be loopback.
 *   2. NODE_ENV must not be "production". The prod container sets it.
 * Independent on purpose: (1) catches a prod URL pasted into a dev shell,
 * (2) catches an SSH port-forward of prod to localhost. Requiring BOTH means a
 * single misconfiguration cannot open the door.
 *
 * NO ESCAPE HATCH (no PUSH_FORCE=1). An escape hatch is the original bug with
 * an extra step — the operator in a hurry who sets it is exactly the operator
 * this exists to stop. A new dev host goes in DEV_HOSTS in a reviewed commit.
 *
 * ⭐ WIRED IN `prisma.config.ts`, NOT IN AN npm SCRIPT.
 * An npm script only guards `npm run db:push`; `npx prisma db push` would walk
 * straight past it, and that is the exact command that caused the original
 * incident. Prisma loads its config file on EVERY invocation, so guarding there
 * covers every entry point.
 *
 * ⚠️ NON-DESTRUCTIVE COMMANDS MUST NOT BE GUARDED. `prisma generate` runs in
 * the Docker build and in `npm run build`; `prisma migrate deploy` is the
 * container's CMD in production, against a non-loopback URL with
 * NODE_ENV=production. If either were treated as destructive, production would
 * fail to build or fail to start. `migrate deploy` is forward-only and applies
 * reviewed migrations — it is the SAFE command and is deliberately absent from
 * the set below.
 */

/** Hosts we are willing to call "dev". Loopback only — see the header. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Commands that can destroy data, as (argv subcommand path) tuples.
 *
 *   db push       — drops any table/column the schema does not declare
 *   migrate reset — drops and recreates the whole database
 *   migrate dev   — may prompt-reset the database on drift
 *
 * `migrate deploy`, `generate`, `validate`, `format`, `db pull`, `migrate diff`
 * and `migrate status` are NOT here: they are forward-only or read-only, and
 * three of them run in production or in the build.
 */
const DESTRUCTIVE_COMMANDS: readonly (readonly string[])[] = [
  ['db', 'push'],
  ['migrate', 'reset'],
  ['migrate', 'dev'],
];

export class UnsafeDatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeDatabaseTargetError';
  }
}

/**
 * The destructive command in this argv, or null.
 *
 * Matches the first two non-flag tokens after the prisma binary, so it is
 * insensitive to flag position (`prisma db push --accept-data-loss` and
 * `prisma --schema=x db push` both match). Pure — takes argv, reads no globals.
 */
export function destructiveCommandIn(argv: readonly string[]): string | null {
  const words = argv
    .slice(2) // node, script
    .filter((a) => !a.startsWith('-'));
  for (const cmd of DESTRUCTIVE_COMMANDS) {
    // The subcommand pair must appear in order at the front of the word list.
    if (words[0] === cmd[0] && words[1] === cmd[1]) return cmd.join(' ');
  }
  return null;
}

/**
 * Throws `UnsafeDatabaseTargetError` unless the target is provably a dev
 * database. Pure function of its inputs (not of `process.env`) so a verify
 * script can drive production-shaped inputs without mutating the running
 * process's environment.
 */
export function assertDbTargetIsDev(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined,
  command = 'this destructive command',
): void {
  if (!databaseUrl) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to run \`prisma ${command}\`: DATABASE_URL is not set, so the target cannot be ` +
        `proven to be a dev database.`,
    );
  }

  // Signal 2 first — cheapest, needs no parsing.
  if (nodeEnv === 'production') {
    throw new UnsafeDatabaseTargetError(
      `Refusing to run \`prisma ${command}\`: NODE_ENV=production. This command can DROP tables — ` +
        `including \`auction_url_v3\` and its 192,589 minted permanent URLs — and must never run ` +
        `against a production environment. Use \`prisma migrate deploy\`.`,
    );
  }

  let host: string;
  let database: string;
  try {
    const parsed = new URL(databaseUrl);
    // Hostnames are case-insensitive, and `new URL` does NOT lowercase them for
    // the postgresql: scheme (only for special schemes like http:). Without
    // this, a legitimate `@LOCALHOST` dev URL is refused — a false refusal, and
    // false refusals are how a guard ends up deleted.
    host = parsed.hostname.toLowerCase();
    database = parsed.pathname.replace(/^\//, '');
  } catch {
    // An unparseable URL is not a proof of dev. Fail closed.
    throw new UnsafeDatabaseTargetError(
      `Refusing to run \`prisma ${command}\`: DATABASE_URL could not be parsed, so the target ` +
        `cannot be proven to be a dev database.`,
    );
  }

  // `new URL` strips the brackets from an IPv6 host, hence both forms in DEV_HOSTS.
  if (!DEV_HOSTS.has(host)) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to run \`prisma ${command}\`: DATABASE_URL points at host ${JSON.stringify(host)}, ` +
        `which is not a known dev target (allowed: ${[...DEV_HOSTS].join(', ')}). This command can ` +
        `DROP tables — including \`auction_url_v3\` and its 192,589 minted permanent URLs. ` +
        `Database: ${JSON.stringify(database)}. To deploy schema changes use \`prisma migrate deploy\`.`,
    );
  }
}

/**
 * The entrypoint `prisma.config.ts` calls on every prisma invocation.
 * A no-op for every non-destructive command, so `generate` / `migrate deploy`
 * are completely unaffected in the build and in production.
 */
export function guardDestructivePrismaCommand(
  argv: readonly string[] = process.argv,
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  const command = destructiveCommandIn(argv);
  if (!command) return;
  assertDbTargetIsDev(databaseUrl, nodeEnv, command);
}
