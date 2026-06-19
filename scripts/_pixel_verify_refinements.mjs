// Pixel — live CDP verification of the 3 /factory refinements:
//   1) projects sidebar lists run(s) + clicking opens the project view
//   2) PDF/print produces a clean full blueprint (printToPDF → real .pdf)
//   3) board shows 6 stage columns, no 7/8
// Shoots: factory-sidebar.png (project view w/ left nav) + factory-pdf.png
// (print-emulated view) + factory-blueprint.pdf (the real PDF).
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
  writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('SHOT', `${OUT_DIR}/${name}.png`);
}
const evalJs = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

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

// ── 1) Board: confirm 6 columns + sidebar lists the project ──────────────────
await send('Page.navigate', { url: 'http://localhost:3000/factory' });
await sleep(4500);
const board = await evalJs(`(() => {
  const cols = [...document.querySelectorAll('[aria-label^="Stage "]')]
    .map(s => s.getAttribute('aria-label').match(/^Stage (\\d+):/)?.[1]).filter(Boolean);
  const sideNav = document.querySelector('nav[aria-label="All projects"]');
  const sideLinks = sideNav ? [...sideNav.querySelectorAll('a[href^="/factory/"]')].map(a=>a.getAttribute('href')) : [];
  const headerP = [...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>/cross-checked stages/.test(t||''));
  return JSON.stringify({ columnNums: cols, sidebarPresent: !!sideNav, sidebarProjectLinks: sideLinks, headerLine: headerP });
})()`);
console.log('BOARD', board);
await shot('factory-board-6col');

// ── 2) Click the sidebar project link → project view opens ───────────────────
const clicked = await evalJs(`(() => {
  const link = document.querySelector('nav[aria-label="All projects"] a[href="/factory/${RUN_ID}"]');
  if (!link) return 'NO_SIDEBAR_LINK';
  link.click();
  return 'CLICKED';
})()`);
console.log('SIDEBAR_CLICK', clicked);
await sleep(3500);
const proj = await evalJs(`(() => {
  const url = location.pathname;
  const h1 = document.querySelector('h1')?.textContent || '';
  const sideNav = !!document.querySelector('nav[aria-label="All projects"]');
  const sections = [...document.querySelectorAll('section[id^="stage-"]')].map(s=>s.id);
  const pdfBtn = [...document.querySelectorAll('button')].some(b=>/Download PDF/.test(b.textContent||''));
  const printDoc = !!document.querySelector('.factory-print-doc');
  return JSON.stringify({ url, h1, sidebarStillPresent: sideNav, stageSections: sections, hasPdfButton: pdfBtn, hasPrintDoc: printDoc });
})()`);
console.log('PROJECT_VIEW', proj);
await shot('factory-sidebar');

// ── 3) Print emulation → screenshot the clean print doc ──────────────────────
await send('Emulation.setEmulatedMedia', { media: 'print' });
await sleep(800);
const printProbe = await evalJs(`(() => {
  const doc = document.querySelector('.factory-print-doc');
  const visible = doc ? getComputedStyle(doc).display !== 'none' : false;
  const cover = !!document.querySelector('.factory-print-cover h1');
  const coverTitle = document.querySelector('.factory-print-cover h1')?.textContent || '';
  const stages = document.querySelectorAll('.factory-print-stage').length;
  const chromeHidden = [...document.querySelectorAll('[data-print-hide]')].every(e=>getComputedStyle(e).display==='none');
  return JSON.stringify({ printDocVisible: visible, coverTitle, stageCount: stages, chromeHidden });
})()`);
console.log('PRINT_PROBE', printProbe);
await shot('factory-pdf');
await send('Emulation.setEmulatedMedia', { media: '' });

// ── Real PDF generation via the browser PDF engine ───────────────────────────
const pdf = await send('Page.printToPDF', {
  printBackground: true, marginTop: 0.7, marginBottom: 0.7, marginLeft: 0.6, marginRight: 0.6,
  paperWidth: 8.27, paperHeight: 11.69, // A4 inches
});
const pdfBytes = Buffer.from(pdf.data, 'base64');
writeFileSync(`${OUT_DIR}/factory-blueprint.pdf`, pdfBytes);
console.log('PDF_BYTES', pdfBytes.length, 'magic', pdfBytes.slice(0, 5).toString('latin1'));

ws.close();
console.log('DONE');
