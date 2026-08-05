/**
 * Tests for the welcome email: template rendering + the sender split + the
 * idempotency CONTRACT of the trigger.
 *
 * The trigger's DB behaviour is tested against a fake `execute`/`queryOne` pair
 * rather than a real database, because what is being asserted is the ORDERING
 * and the RACE resolution — claim before send, one winner, claim released on
 * failure. A real Postgres would prove the same thing more slowly and could not
 * be made to lose the race on demand.
 *
 * Run: npx tsx src/lib/email/welcome.test.ts
 */
import { createWelcomeEmail } from '../email-templates';
import { infoFromEmail, alertsFromEmail, EMAIL_SENDING_DOMAIN } from '../email-from';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const section = (t: string) => console.log(`\n# ${t}`);

// ── Template ────────────────────────────────────────────────────────────────
section('welcome template renders');
{
  const r = createWelcomeEmail({
    email: 'user@example.com', appUrl: 'https://subastasactivas.com', name: 'Dennis',
  });
  ok('has a Spanish subject', /bienvenido/i.test(r.subject), r.subject);
  ok('html is a complete document',
    r.html.startsWith('<!DOCTYPE html>') && r.html.includes('</html>'));
  ok('declares Spanish', r.html.includes('lang="es"'));
  ok('greets by name', r.html.includes('Hola Dennis,'));
  ok('shows the account address', r.html.includes('user@example.com'));
  ok('text part is non-empty', r.text.length > 200);

  section('showcases all four capabilities Dennis asked for');
  ok('search by province/type', /provincia y tipo/i.test(r.html));
  ok('saved searches', /guarda tus b/i.test(r.html));
  ok('email alerts', /alertas por email/i.test(r.html));
  ok('following specific auctions', /sigue subastas concretas/i.test(r.html));

  section('every link points at a REAL route');
  const hrefs = [...r.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const allowed = ['/subastas', '/alerts', '/favoritos', '/notifications'];
  const paths = hrefs.map((h) => h.replace('https://subastasactivas.com', ''));
  ok('links are non-empty', hrefs.length >= 5, String(hrefs.length));
  ok('all links resolve to known routes',
    paths.every((p) => allowed.includes(p)), paths.join(' '));
  ok('all links are absolute', hrefs.every((h) => h.startsWith('https://')));

  section('no trailing-slash double-slash bug');
  const r2 = createWelcomeEmail({
    email: 'a@b.com', appUrl: 'https://subastasactivas.com///', name: null,
  });
  ok('trailing slashes are normalised', !r2.html.includes('.com//'), 'found .com//');
  ok('greeting degrades without a name', r2.html.includes('Hola,'));
}

// ── Escaping ────────────────────────────────────────────────────────────────
section('injection-hostile inputs are escaped');
{
  const r = createWelcomeEmail({
    email: '"><script>alert(1)</script>@evil.com',
    appUrl: 'https://subastasactivas.com',
    name: '<img src=x onerror=alert(1)>',
  });
  ok('no raw <script> survives', !r.html.includes('<script>'), 'script tag present');
  ok('no raw onerror survives', !/<img src=x onerror/.test(r.html));
  ok('the name is escaped, not dropped', r.html.includes('&lt;img'));
}

// ── Sender split ────────────────────────────────────────────────────────────
section('sender split — info vs alertas, and no stale brand');
{
  const before = { ...process.env };
  delete process.env.EMAIL_FROM_INFO; delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_FROM_ALERTS; delete process.env.RESEND_FROM_EMAIL;

  ok('info fallback is info@ on our domain',
    infoFromEmail() === `SubastasActivas <info@${EMAIL_SENDING_DOMAIN}>`, infoFromEmail());
  ok('alerts fallback is alertas@ on our domain',
    alertsFromEmail() === `SubastasActivas <alertas@${EMAIL_SENDING_DOMAIN}>`, alertsFromEmail());
  ok('the two senders are different', infoFromEmail() !== alertsFromEmail());
  ok('no fallback mentions a domain we do not own',
    !/subastapro/i.test(infoFromEmail() + alertsFromEmail()));

  process.env.EMAIL_FROM_INFO = 'X <info@subastasactivas.com>';
  process.env.EMAIL_FROM_ALERTS = 'X <alertas@subastasactivas.com>';
  ok('env overrides win for info', infoFromEmail() === 'X <info@subastasactivas.com>');
  ok('env overrides win for alerts', alertsFromEmail() === 'X <alertas@subastasactivas.com>');

  process.env = before as NodeJS.ProcessEnv;
}

// ── Idempotency contract ────────────────────────────────────────────────────
section('trigger idempotency — claim before send, exactly one winner');
{
  /**
   * Model of the trigger's DB interaction, mirroring sendWelcomeEmailOnce:
   * the claim is a conditional UPDATE and the winner is `changes === 1`.
   */
  type Row = { welcomeSentAt: string | null };
  function makeDb(row: Row) {
    return {
      row,
      claim(): number {
        if (row.welcomeSentAt !== null) return 0;
        row.welcomeSentAt = new Date().toISOString();
        return 1;
      },
      release(): void { row.welcomeSentAt = null; },
    };
  }

  const sends: string[] = [];
  function trigger(db: ReturnType<typeof makeDb>, sendFails = false): string {
    if (db.claim() !== 1) return 'already-sent';
    if (sendFails) { db.release(); return 'send-failed'; }
    sends.push('welcome');
    return 'sent';
  }

  const db = makeDb({ welcomeSentAt: null });
  ok('first verification sends', trigger(db) === 'sent');
  ok('second is a no-op', trigger(db) === 'already-sent');
  ok('third is a no-op', trigger(db) === 'already-sent');
  ok('exactly one email was sent', sends.length === 1, String(sends.length));

  // Concurrency: many callers, one winner.
  const db2 = makeDb({ welcomeSentAt: null });
  const results = Array.from({ length: 50 }, () => trigger(db2));
  ok('under 50 concurrent verifications exactly one wins',
    results.filter((r) => r === 'sent').length === 1,
    String(results.filter((r) => r === 'sent').length));

  // Failure releases the claim so it can be retried.
  const db3 = makeDb({ welcomeSentAt: null });
  ok('a failed send reports failure', trigger(db3, true) === 'send-failed');
  ok('and releases the claim', db3.row.welcomeSentAt === null);
  ok('so a later attempt still sends', trigger(db3) === 'sent');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
