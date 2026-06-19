// Pixel — CDP screenshots for the Stage-1 niche-picker + hint box.
// Opens a FRESH tab (Target.createTarget) so it isn't fighting another driver's
// tab, sets the owner cookie, then:
//   1) opens the create modal → shoots the HINT box,
//   2) opens the fixture run's niche-picker → shoots the 5 candidates,
//   3) expands a rationale, then fires a select → "Building…" selected state.
import { writeFileSync } from 'node:fs';

const TOKEN = process.env.PIXEL_TOKEN;
const RUN_ID = process.env.PIXEL_RUN_ID || '';
const OUT_DIR = process.env.PIXEL_OUT_DIR || '.';

// Open a brand-new tab dedicated to this run.
const created = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json()
  .catch(async () => (await fetch('http://localhost:9222/json/new?about:blank')).json());
const tab = created;
if (!tab?.webSocketDebuggerUrl) { console.error('NO_NEW_TAB', JSON.stringify(created)); process.exit(1); }
console.log('new tab', tab.id);

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
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
  } else if (msg.method) events.push(msg.method);
});
await new Promise((res) => ws.addEventListener('open', res));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log('SHOT', path);
}
const evalJs = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

async function navigate(url) {
  const loaded = new Promise((res) => {
    const t = setInterval(() => {
      if (events.includes('Page.loadEventFired')) { clearInterval(t); res(); }
    }, 100);
    setTimeout(() => { clearInterval(t); res(); }, 12000);
  });
  events.length = 0;
  await send('Page.navigate', { url });
  await loaded;
}

await send('Network.enable', {});
await send('Network.setCookie', {
  name: 'auth_token', value: TOKEN, domain: 'localhost', path: '/',
  httpOnly: true, secure: false, sameSite: 'Lax',
});
await send('Page.enable', {});
await send('Runtime.enable', {});
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});

await navigate('http://localhost:3000/factory');
// Wait until the board actually mounts (cards present).
for (let i = 0; i < 30; i++) {
  const ready = await evalJs(`!!document.querySelector('[data-run-id]') && !!document.querySelector('h1')`);
  if (ready) break;
  await sleep(500);
}
const url0 = await evalJs(`location.pathname`);
console.log('ON', url0);

// 1) HINT box — open the create modal.
const openedCreate = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /create a project/i.test(b.textContent||''));
  if (!btn) return 'NO_CREATE_BTN';
  btn.click();
  return 'OPENED';
})()`);
console.log('CREATE_OPEN', openedCreate);
await sleep(900);
await shot('niche-hint-box');
const hintProbe = await evalJs(`(() => {
  const input = document.querySelector('#hint-input');
  const btn = [...document.querySelectorAll('button')].find(b => /discover niches/i.test(b.textContent||''));
  return JSON.stringify({ hasHintInput: !!input, placeholder: input?.placeholder || '', hasDiscoverBtn: !!btn });
})()`);
console.log('HINT_PROBE', hintProbe);
await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/^cancel$/i.test((x.textContent||'').trim())); b?.click(); return 'CLOSED'; })()`);
await sleep(600);

// 2) NICHE-PICKER — deep-link /factory?run=<id> opens the run drawer; for an
//    awaiting_selection run the workspace renders the NichePicker. This avoids
//    the card-click hit-area ambiguity entirely.
await navigate('http://localhost:3000/factory?run=' + RUN_ID);
let openedPicker = 'NO_PICKER';
for (let i = 0; i < 30; i++) {
  const ready = await evalJs(`(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Pick a niche to build"]');
    const arts = document.querySelectorAll('article').length;
    return dlg && arts >= 3 ? 'OPENED_PICKER' : null;
  })()`);
  if (ready) { openedPicker = ready; break; }
  await sleep(500);
}
console.log('PICKER_OPEN', openedPicker);
await sleep(800);
await shot('niche-picker-candidates');
const pickerProbe = await evalJs(`(() => {
  const cards = document.querySelectorAll('article').length;
  const tiers = [...document.querySelectorAll('span')].filter(s => ['S','A','B','C'].includes((s.textContent||'').trim()) && s.className.includes('gradient')).map(s=>s.textContent.trim());
  const buildBtns = [...document.querySelectorAll('button')].filter(b=>/build this one/i.test(b.textContent||'')).length;
  const flags = [...document.querySelectorAll('[role="note"]')].length;
  const comp = [...document.querySelectorAll('span')].filter(s=>/^(Easy|Medium|Hard)$/.test((s.textContent||'').trim())).map(s=>s.textContent.trim());
  return JSON.stringify({ cards, tiers, buildBtns, advisoryFlags: flags, competition: comp });
})()`);
console.log('PICKER_PROBE', pickerProbe);

// 3) Expand the first card's rationale ("Why this niche?").
await evalJs(`(() => {
  const art = document.querySelector('article');
  const why = [...art.querySelectorAll('button')].find(b => /why this niche/i.test(b.textContent||''));
  why?.click();
  return why ? 'EXPANDED' : 'NO_WHY';
})()`);
await sleep(500);
await shot('niche-picker-rationale-expanded');

// 4) SELECTED STATE — click "Build this one" on the top candidate; capture the
//    "Building…" busy state in the ~200ms before the network resolves.
await evalJs(`(() => {
  const art = document.querySelector('article');
  const build = [...art.querySelectorAll('button')].find(b => /build this one/i.test(b.textContent||''));
  build?.click();
  return build ? 'CLICKED_BUILD' : 'NO_BUILD';
})()`);
await sleep(200);
await shot('niche-picker-selected');
const selProbe = await evalJs(`(() => {
  const building = /building…/i.test(document.body.textContent||'');
  const ring = !!document.querySelector('article[class*="ring-2"]');
  return JSON.stringify({ buildingLabelVisible: building, selectedRing: ring });
})()`);
console.log('SELECTED_PROBE', selProbe);

ws.close();
console.log('DONE');
