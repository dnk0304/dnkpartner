/**
 * Unit tests for buildAlertInsert (F2a propertyType persistence).
 * Run with: npx tsx src/lib/alerts/alert-insert.test.ts
 * No test framework — plain assertions, exit-code-driven.
 */
import { buildAlertInsert, ALERT_INSERT_COLUMNS } from './alert-insert';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const IDS = { id: 'alert-1', userId: 'user-1', now: '2026-07-28T00:00:00.000Z' };

// 1) propertyType round-trips into the params at the right column position.
{
  const body = {
    name: 'Mi alerta',
    source: 'BOE',
    propertyType: 'Vivienda',
    province: 'MADRID',
    municipality: 'Madrid',
    category: 'inmuebles',
    auctionType: 'JUDICIAL',
    minPrice: '1000',
    maxPrice: '50000',
    emailEnabled: true,
    smsEnabled: false,
    notificationType: 'individual',
  };
  const { sql, params, columns } = buildAlertInsert(body, IDS);
  const idx = columns.indexOf('propertyType');
  check('propertyType is a column', idx >= 0);
  check('propertyType value persisted', params[idx] === 'Vivienda');
  check('column count === param count', columns.length === params.length);
  check('sql lists propertyType', /\bpropertyType\b/.test(sql));
  check('placeholder count matches columns', (sql.match(/\?/g) || []).length === ALERT_INSERT_COLUMNS.length);
  // spot-check coercions preserved from prior inline behaviour
  check('minPrice parsed to number', params[columns.indexOf('minPrice')] === 1000);
  check('emailEnabled true', params[columns.indexOf('emailEnabled')] === true);
  check('smsEnabled false', params[columns.indexOf('smsEnabled')] === false);
  check('notificationType passthrough', params[columns.indexOf('notificationType')] === 'individual');
  check('name persisted', params[columns.indexOf('name')] === 'Mi alerta');
  check('source persisted', params[columns.indexOf('source')] === 'BOE');
}

// 2) Honest-null: missing propertyType → null, not undefined/empty-string.
{
  const { params, columns } = buildAlertInsert({ province: 'SEVILLA' }, IDS);
  check('missing propertyType → null', params[columns.indexOf('propertyType')] === null);
  check('empty maxPrice → null', params[columns.indexOf('maxPrice')] === null);
  check('missing notificationType → grouped default', params[columns.indexOf('notificationType')] === 'grouped');
  check('empty string propertyType → null', buildAlertInsert({ propertyType: '' }, IDS).params[columns.indexOf('propertyType')] === null);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nalert-insert: all assertions passed');
