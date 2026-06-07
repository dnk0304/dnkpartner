/**
 * C2 verify: shortStreetName fixtures.
 * Run with: node scripts/verify-shortstreet.mjs
 *
 * Reads the compiled output via tsx-style transpile is overkill — instead we
 * inline the test inputs and print expected/actual pairs after a quick ts→mjs
 * eval through a tsc one-shot. Simpler: just import via tsx if installed,
 * else dump a self-contained ts -> mjs compile.
 *
 * To keep this script dependency-free, we paste the helper inline below.
 */

// ---- INLINE COPY OF shortStreetName (must stay in sync with src/lib/seo/display-title.ts) ----
const VIA_TYPE_MAP = [
  [/^urbanizaci[oó]n(?:\.|\b)\s*/i, 'Urbanización'],
  [/^urb(?:\.|\b)\s*/i, 'Urbanización'],
  [/^carretera(?:\.|\b)\s*/i, 'Carretera'],
  [/^ctra(?:\.|\b)\s*/i, 'Carretera'],
  [/^avenida(?:\.|\b)\s*/i, 'Avenida'],
  [/^avda(?:\.|\b)\s*/i, 'Avenida'],
  [/^av(?:\.|\b)\s*/i, 'Avenida'],
  [/^travesía(?:\.|\b)\s*/i, 'Travesía'],
  [/^travesia(?:\.|\b)\s*/i, 'Travesía'],
  [/^trav(?:\.|\b)\s*/i, 'Travesía'],
  [/^callej[oó]n(?:\.|\b)\s*/i, 'Callejón'],
  [/^calle(?:\.|\b)\s*/i, 'Calle'],
  [/^c\/\s*/i, 'Calle'],
  [/^cl(?:\.|\b)\s*/i, 'Calle'],
  [/^c\.\s*/i, 'Calle'],
  [/^c\s+/i, 'Calle'],
  [/^plaza(?:\.|\b)\s*/i, 'Plaza'],
  [/^pza(?:\.|\b)\s*/i, 'Plaza'],
  [/^pl(?:\.|\b)\s*/i, 'Plaza'],
  [/^paseo(?:\.|\b)\s*/i, 'Paseo'],
  [/^p[ºo°]\.?\s*/i, 'Paseo'],
  [/^camino(?:\.|\b)\s*/i, 'Camino'],
  [/^cmno(?:\.|\b)\s*/i, 'Camino'],
  [/^cno(?:\.|\b)\s*/i, 'Camino'],
  [/^ronda(?:\.|\b)\s*/i, 'Ronda'],
  [/^glorieta(?:\.|\b)\s*/i, 'Glorieta'],
  [/^pasaje(?:\.|\b)\s*/i, 'Pasaje'],
  [/^v[ií]a(?:\.|\b)\s*/i, 'Vía'],
];
const SPANISH_CONNECTOR_TOKENS = new Set(['de', 'del', 'y', 'i', 'da', 'do', 'das', 'dos']);
const SPANISH_ARTICLE_TOKENS = new Set(['la', 'las', 'los', 'el']);
function titleCaseStreetName(name) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const lowers = tokens.map((t) => t.toLowerCase());
  return tokens
    .map((tok, idx) => {
      const lower = lowers[idx];
      const prevLower = idx > 0 ? lowers[idx - 1] : null;
      if (SPANISH_CONNECTOR_TOKENS.has(lower)) return lower;
      if (idx > 0 && SPANISH_ARTICLE_TOKENS.has(lower) && prevLower !== null && SPANISH_CONNECTOR_TOKENS.has(prevLower)) {
        return lower;
      }
      if (lower.includes('-')) {
        return lower.split('-').map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('-');
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
function cleanString(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function shortStreetName(address) {
  const raw = cleanString(address);
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  let viaLabel = null;
  let rest = collapsed;
  for (const [pattern, label] of VIA_TYPE_MAP) {
    const match = pattern.exec(collapsed);
    if (match) {
      viaLabel = label;
      rest = collapsed.slice(match[0].length).trim();
      break;
    }
  }
  if (!viaLabel) return null;
  const commaIdx = rest.indexOf(',');
  const slashNIdx = rest.search(/\bs\s*\/\s*n\b/i);
  const kmIdx = rest.search(/\bkm\s+\d/i);
  let firstDigitTokenIdx = -1;
  {
    const tokenRe = /\S+/g;
    let m;
    while ((m = tokenRe.exec(rest)) !== null) {
      if (/^\d/.test(m[0])) { firstDigitTokenIdx = m.index; break; }
    }
  }
  const candidates = [commaIdx, slashNIdx, kmIdx, firstDigitTokenIdx].filter((v) => v >= 0);
  const cutoff = candidates.length > 0 ? Math.min(...candidates) : rest.length;
  const streetTokensRaw = rest.slice(0, cutoff).trim();
  const streetTokens = streetTokensRaw.replace(/[,;:.\s]+$/, '').trim();
  if (!streetTokens) return null;
  const streetName = titleCaseStreetName(streetTokens);
  if (!streetName) return null;
  return `${viaLabel} ${streetName}`;
}

const cases = [
  // Brief examples (Dennis-provided)
  ['Cl La Ermita 18 J 00 2, Agüimes', 'Calle La Ermita'],
  ['Av Pere Mas I Reus, De 25 Es:1 Pl:03 Pt:09, Alcudia', 'Avenida Pere Mas i Reus'],
  // Brief acceptance examples
  ['Calle Tollo, 19, 3-A', 'Calle Tollo'],
  ['C/ del Pino 4, 2º D', 'Calle del Pino'],
  ['Avenida de Madrid, 47', 'Avenida de Madrid'],
  ['Pza. Mayor, s/n', 'Plaza Mayor'],
  ['Camino Real km 4,2', 'Camino Real'],
  ['Urbanización Los Olivos 15D', 'Urbanización Los Olivos'],
  // Extra robustness
  ['Avda. de la Constitución, 12', 'Avenida de la Constitución'],
  ['Ctra. N-340, km 12', 'Carretera N-340'],
  ['Pº de la Castellana 100', 'Paseo de la Castellana'],
  ['Ronda Sur 45', 'Ronda Sur'],
  // Should return null
  ['Sin dirección', null],
  ['', null],
  [null, null],
  [undefined, null],
];

let pass = 0, fail = 0;
console.log('shortStreetName fixtures:');
for (const [input, expected] of cases) {
  const got = shortStreetName(input);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] in=${JSON.stringify(input)}  expected=${JSON.stringify(expected)}  got=${JSON.stringify(got)}`);
}
console.log(`\nTotal: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
