// Inject owner cookie via CDP and navigate the visible Chrome tab to /factory.
const TOKEN = process.env.KEN_TOKEN;
const RUN_ID = process.env.KEN_RUN_ID || '';
const targetUrl = RUN_ID
  ? `http://localhost:3000/factory?run=${RUN_ID}`
  : 'http://localhost:3000/factory';

// Find a real page tab (type === 'page'), prefer about:blank.
const list = await (await fetch('http://localhost:9222/json')).json();
let tab = list.find(t => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith('http')));
if (!tab) tab = list.find(t => t.type === 'page');
if (!tab) { console.error('NO_PAGE_TAB'); process.exit(1); }
console.log('Using tab', tab.id, tab.url);

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
await new Promise((res) => ws.addEventListener('open', res));

await send('Network.enable', {});
await send('Network.setCookie', {
  name: 'auth_token',
  value: TOKEN,
  domain: 'localhost',
  path: '/',
  httpOnly: true,
  secure: false,
  sameSite: 'Lax',
});
console.log('cookie set');
await send('Page.enable', {});
await send('Page.navigate', { url: targetUrl });
console.log('navigated to', targetUrl);
await new Promise(r => setTimeout(r, 1500));
ws.close();
console.log('DONE');
