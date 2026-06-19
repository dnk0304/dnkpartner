// Pixel — CDP verification: set owner cookie on the live Chrome, navigate to
// /factory, screenshot the board, then open the test run's detail and shoot
// that too. Proves the page RENDERS + FUNCTIONS in the running dev server.
import { writeFileSync } from 'node:fs';

const TOKEN = process.env.PIXEL_TOKEN;
const RUN_ID = process.env.PIXEL_RUN_ID || '';
const OUT_DIR = process.env.PIXEL_OUT_DIR || '.';

const list = await (await fetch('http://localhost:9222/json')).json();
let tab = list.find((t) => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith('http')));
if (!tab) tab = list.find((t) => t.type === 'page');
if (!tab) { console.error('NO_PAGE_TAB'); process.exit(1); }
console.log('tab', tab.id, tab.url);

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
await new Promise((res) => ws.addEventListener('open', res));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log('SHOT', path);
}

await send('Network.enable', {});
await send('Network.setCookie', {
  name: 'auth_token', value: TOKEN, domain: 'localhost', path: '/',
  httpOnly: true, secure: false, sameSite: 'Lax',
});
await send('Page.enable', {});
await send('Runtime.enable', {});
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});

// 1) Board
await send('Page.navigate', { url: 'http://localhost:3000/factory' });
await sleep(4500);
await shot('factory-board');

// Report what's actually on screen (proves render, not a blank page).
const probe = await send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.querySelectorAll('[data-run-id]').length;
    const cols = document.querySelectorAll('[aria-label^="Stage "]').length;
    const h1 = document.querySelector('h1')?.textContent || '';
    const kpis = document.querySelectorAll('.tabular-nums').length;
    return JSON.stringify({ h1, cards, cols, kpis });
  })()`,
  returnByValue: true,
});
console.log('BOARD_PROBE', probe.result.value);

// 2) Open the test run's detail (click its card by data-run-id).
if (RUN_ID) {
  const clicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('[data-run-id="${RUN_ID}"] button');
      if (!card) return 'NO_CARD';
      card.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log('DETAIL_CLICK', clicked.result.value);
  await sleep(3000);
  await shot('factory-detail');

  const detailProbe = await send('Runtime.evaluate', {
    expression: `(() => {
      const hasRanking = !!document.querySelector('table');
      const tiers = [...document.querySelectorAll('span')].filter(s => ['S','A','B','C'].includes(s.textContent.trim()) && s.className.includes('gradient')).map(s=>s.textContent.trim());
      const verdicts = [...document.querySelectorAll('*')].filter(e=>/:\\s*(PASS|FAIL)/.test(e.textContent||'') && e.children.length<3).length;
      const experts = ['demand-data-analyst','saturation-competition-specialist','buyer-psychology-pain-specialist'].filter(x => document.body.textContent.includes(x));
      return JSON.stringify({ hasRanking, tiers, expertsFound: experts });
    })()`,
    returnByValue: true,
  });
  console.log('DETAIL_PROBE', detailProbe.result.value);
}

ws.close();
console.log('DONE');
