/**
 * Unit tests for mapNotificationRow (F2b notifications history shape).
 * Run with: npx tsx src/lib/notifications/history.test.ts
 * No test framework — plain assertions, exit-code-driven.
 */
import { mapNotificationRow } from './history';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// 1) Full row → clickable auction reference with canonical slug/url.
{
  const item = mapNotificationRow({
    id: 'notif-1',
    auctionId: 'ck9auction00001',
    channel: 'email',
    sentAt: new Date('2026-07-20T09:00:00.000Z'),
    read: false,
    title: 'Piso en Madrid',
    auctionType: 'JUDICIAL',
    province: 'MADRID',
    municipality: 'Madrid',
    imageUrl: '/api/auction-image/SUB-1',
  });
  check('id passthrough', item.id === 'notif-1');
  check('auctionId passthrough', item.auctionId === 'ck9auction00001');
  check('title passthrough', item.title === 'Piso en Madrid');
  check('slug ends with auctionId', item.slug.endsWith('ck9auction00001'));
  check('url = /subastas/subasta/{slug}', item.url === `/subastas/subasta/${item.slug}`);
  check('channel passthrough', item.channel === 'email');
  check('sentAt is ISO string', item.sentAt === '2026-07-20T09:00:00.000Z');
  check('read boolean', item.read === false);
  check('imageUrl passthrough', item.imageUrl === '/api/auction-image/SUB-1');
  check('province/municipality passthrough', item.province === 'MADRID' && item.municipality === 'Madrid');
}

// 2) Honest-null: deleted auction (LEFT JOIN nulls) still yields a usable url.
{
  const item = mapNotificationRow({
    id: 'notif-2',
    auctionId: 'ghost-auction-id',
    channel: 'email',
    sentAt: '2026-07-19T00:00:00.000Z',
    title: null,
    auctionType: null,
    province: null,
    municipality: null,
    imageUrl: null,
  });
  check('null title → null', item.title === null);
  check('url still built from auctionId', item.url.includes('ghost-auction-id'));
  check('null imageUrl → null', item.imageUrl === null);
  check('read defaults false when absent', item.read === false);
  check('string sentAt passes through', item.sentAt === '2026-07-19T00:00:00.000Z');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nhistory: all assertions passed');
