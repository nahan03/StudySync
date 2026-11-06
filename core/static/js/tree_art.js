/* Shared tree artwork: subject -> tree type, and procedural SVG trees.
   Used by the Forest page and the Study page's growth overlay.
   API: window.TreeArt = { getTreeForSubject, treeSvg, rng, hashStr, f1, TREE_MAP } */
(function () {
'use strict';

const TREE_MAP = [
  { keywords: ['math', 'calc', 'algebra', 'geometry', 'statistic', 'trigonom', 'number'],  kind: 'conifer',   name: 'Pine'         },
  { keywords: ['bio', 'life', 'ecolog', 'genetic', 'anatom', 'botan', 'zoolog', 'environment', 'health', 'medic', 'nurs'],      kind: 'oak',       name: 'Oak'          },
  { keywords: ['chem', 'periodic', 'molecule', 'reaction', 'element'],          kind: 'bamboo',    name: 'Bamboo'       },
  { keywords: ['phys', 'mechanic', 'force', 'quantum', 'optic', 'wave', 'astronom', 'space'],       kind: 'palm',      name: 'Palm'         },
  { keywords: ['histor', 'civil', '=war', 'ancient', 'medieval', 'politic', 'government', 'social stud'],     kind: 'maple',     name: 'Maple'        },
  { keywords: ['english', 'literature', 'writing', 'essay', 'grammar', 'lang', 'spanish', 'french', 'german', 'latin', 'chinese', 'japanese', 'arabic', 'hindi'], kind: 'fern',      name: 'Fern'         },
  { keywords: ['geo', 'earth', 'climate', 'plate', 'volcano', 'ocean'],         kind: 'cactus',    name: 'Cactus'       },
  { keywords: ['=art', 'design', 'draw', 'paint', 'creative', 'visual', 'drama', 'film', 'photograph', 'theatre'],         kind: 'blossom',   name: 'Blossom'      },
  { keywords: ['music', 'theory', 'harmony', 'rhythm', 'instrument'],           kind: 'bamboo',    name: 'Bamboo Grove' },
  { keywords: ['computer', 'coding', 'program', 'software', 'data', '=cs', '=it', 'robot', 'cyber', 'engineer'],      kind: 'cyber',     name: 'Cyber Tree'   },
  { keywords: ['econom', 'financ', 'market', 'business', 'account', 'law'],         kind: 'autumn',    name: 'Autumn Oak'   },
  { keywords: ['psychology', 'psych', 'mind', 'behaviour', 'cognitive'],        kind: 'lotus',     name: 'Lotus'        },
];
const DEFAULT_TREE = { kind: 'oak', name: 'Oak' };

/* A keyword matches at the start of a word ("bio" finds "biology" but "start" does not find "art");
   a keyword starting with = must be a whole word, so "=cs" does not match "economics" and "=war" does not match "software". */
function hasKeyword(text, kw) {
  return kw[0] === '=' ? new RegExp('(^|[^a-z])' + kw.slice(1) + '($|[^a-z])').test(text) : new RegExp('(^|[^a-z])' + kw).test(text);
}
function getTreeForSubject(subject) {
  if (!subject) return DEFAULT_TREE;
  const s = String(subject).toLowerCase();
  for (const t of TREE_MAP) if (t.keywords.some(k => hasKeyword(s, k))) return t;
  return DEFAULT_TREE;
}

/* ══════════════════════════════════════════
   TREE ARTWORK (SVG, viewBox 0 0 100 140, ground at y=136)
══════════════════════════════════════════ */
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const f1 = n => Math.round(n * 10) / 10;

const PAL = {
  oak:     { trunk: '#6B4423', leaves: ['#2F6B2A', '#3F8A35', '#6BBA52'] },
  maple:   { trunk: '#6A3A2A', leaves: ['#B83A1E', '#E0592A', '#F5964A'] },
  autumn:  { trunk: '#6B4423', leaves: ['#B8741E', '#D8942E', '#F2C25A'] },
  blossom: { trunk: '#7A4A38', leaves: ['#D86A90', '#F090B0', '#FFD0DE'] },
  lotus:   { trunk: '#5A4A30', leaves: ['#2F7A3A', '#4AA050', '#7CC86A'], flowers: ['#B05AD0', '#E08AF0'] },
  cyber:   { trunk: '#16323C', leaves: ['#0F7E80', '#18C4C4', '#8CFAF2'] },
  conifer: { trunk: '#5A3A22', leaves: ['#1F5A3A', '#2A7A4E', '#46A874'] },
  fern:    { trunk: '#5A4A30', leaves: ['#2F7A3A', '#4AA050', '#86D072'] },
};

function broadleaf(kind, r) {
  const p = PAL[kind] || PAL.oak, L = p.leaves, j = () => (r() - 0.5) * 6;
  const blobs = [[50, 58, 34], [29, 74, 22], [71, 74, 22], [38, 42, 20], [62, 40, 20], [50, 28, 17]];
  let s = `<path d="M45 136 C47 112 45 96 43 84 L57 84 C55 96 53 112 55 136 Z" fill="${p.trunk}"/>` +
          `<path d="M50 96 L36 80 M50 90 L65 76" stroke="${p.trunk}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
  blobs.forEach(([x, y, rad]) => { s += `<circle cx="${f1(x + j())}" cy="${f1(y + j())}" r="${f1(rad)}" fill="${L[0]}"/>`; });
  blobs.forEach(([x, y, rad]) => { s += `<circle cx="${f1(x - 4 + j() * .4)}" cy="${f1(y - 5)}" r="${f1(rad * .66)}" fill="${L[1]}"/>`; });
  [[40, 36, 9], [58, 34, 8], [32, 62, 8], [66, 58, 7], [50, 50, 8]].forEach(([x, y, rad]) => {
    s += `<circle cx="${f1(x + j() * .5)}" cy="${f1(y)}" r="${rad}" fill="${L[2]}" opacity=".85"/>`;
  });
  if (kind === 'blossom') {
    for (let i = 0; i < 14; i++) s += `<circle cx="${f1(18 + r() * 64)}" cy="${f1(16 + r() * 66)}" r="${f1(1.6 + r() * 1.6)}" fill="#FFF0F5" opacity=".9"/>`;
  }
  if (kind === 'cyber') {
    s += `<g fill="none" stroke="#B8FFF8" stroke-width="1" opacity=".75"><path d="M34 70 H48 V52 H62"/><path d="M42 40 V54"/><path d="M60 72 H70 V60"/></g>`;
    [[34, 70], [62, 52], [42, 40], [70, 60]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#E8FFFC"/>`; });
  }
  return s;
}

function conifer(r) {
  const L = PAL.conifer.leaves;
  let s = `<rect x="46" y="112" width="8" height="24" rx="1.5" fill="${PAL.conifer.trunk}"/>`;
  const tiers = [[8, 44, 24], [34, 70, 31], [58, 96, 38], [82, 120, 45]];
  tiers.forEach(([top, base, w], i) => {
    const wob = (r() - 0.5) * 3;
    s += `<polygon points="50,${top} ${f1(50 - w + wob)},${base} ${f1(50 + w + wob)},${base}" fill="${L[0]}"/>` +
         `<polygon points="50,${top} 50,${base} ${f1(50 + w + wob)},${base}" fill="${L[1]}" opacity=".85"/>` +
         `<polygon points="50,${top + 6} ${f1(50 + w * .45)},${base - 6} 50,${base - 6}" fill="${L[2]}" opacity=".35"/>`;
  });
  return s;
}

function palm(r) {
  const lean = 6 + r() * 6;
  let s = `<path d="M47 136 Q${f1(42)} 90 ${f1(50 + lean)} 44" stroke="#8A6A3A" stroke-width="8" fill="none" stroke-linecap="round"/>` +
          `<path d="M47 136 Q${f1(42)} 90 ${f1(50 + lean)} 44" stroke="#6E5230" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="2 6" opacity=".7"/>`;
  const hx = 50 + lean, hy = 44;
  [[-46, -6, 12], [-34, -26, -2], [-12, -34, -8], [14, -34, -8], [36, -24, -2], [48, -4, 10], [-30, 6, 22], [30, 8, 22]].forEach(([dx, dy, droop], i) => {
    s += `<path d="M${hx} ${hy} Q${f1(hx + dx * .5)} ${f1(hy + dy - 8)} ${f1(hx + dx)} ${f1(hy + dy + droop)}" stroke="${i % 2 ? '#2F8A3A' : '#4AAA4A'}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`;
  });
  s += `<circle cx="${hx - 3}" cy="${hy + 5}" r="4" fill="#6A4A22"/><circle cx="${hx + 4}" cy="${hy + 6}" r="4" fill="#7A5A2A"/>`;
  return s;
}

function bamboo(r) {
  let s = '';
  [[36, 38, 5], [50, 14, 6], [64, 30, 5]].forEach(([x, top, w]) => {
    s += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${136 - top}" rx="2" fill="#8DB84A"/>` +
         `<rect x="${x - w / 2}" y="${top}" width="${w * .35}" height="${136 - top}" rx="1" fill="#B8DC6E" opacity=".7"/>`;
    for (let y = top + 16; y < 134; y += 18) s += `<rect x="${x - w / 2 - 1}" y="${y}" width="${w + 2}" height="2.4" rx="1" fill="#5E8A2A"/>`;
    for (let k = 0; k < 3; k++) {
      const ly = top + 8 + k * 14, dir = (k + x) % 2 ? 1 : -1;
      s += `<ellipse cx="${x + dir * 9}" cy="${ly}" rx="9" ry="2.6" transform="rotate(${dir * -28} ${x + dir * 9} ${ly})" fill="${k % 2 ? '#7DC04A' : '#5FA83A'}"/>`;
    }
  });
  return s;
}

function cactus(r) {
  return `<rect x="42" y="36" width="16" height="100" rx="8" fill="#3F8A52"/><rect x="42" y="36" width="6" height="100" rx="3" fill="#5BB06E" opacity=".7"/>` +
    `<rect x="24" y="86" width="22" height="9" rx="4.5" fill="#3F8A52"/><rect x="24" y="62" width="9" height="33" rx="4.5" fill="#3F8A52"/><rect x="24" y="62" width="3.5" height="33" rx="1.7" fill="#5BB06E" opacity=".7"/>` +
    `<rect x="54" y="74" width="22" height="9" rx="4.5" fill="#3F8A52"/><rect x="67" y="50" width="9" height="33" rx="4.5" fill="#3F8A52"/><rect x="67" y="50" width="3.5" height="33" rx="1.7" fill="#5BB06E" opacity=".7"/>` +
    `<circle cx="50" cy="34" r="5.5" fill="#F06A9A"/><circle cx="50" cy="34" r="2.2" fill="#FFD84A"/>` +
    [[46, 60], [54, 82], [47, 104], [53, 118], [28, 78], [72, 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#E8F5D0" opacity=".8"/>`).join('');
}

function fern(kind, r) {
  const L = PAL.fern.leaves;
  let s = '';
  for (let i = 0; i < 11; i++) {
    const ang = -74 + i * 14.8 + (r() - 0.5) * 6, len = 30 + r() * 22;
    s += `<ellipse cx="50" cy="${f1(136 - len)}" rx="${f1(6 + r() * 3)}" ry="${f1(len)}" transform="rotate(${f1(ang)} 50 136)" fill="${L[i % 3]}" opacity=".95"/>`;
  }
  return s;
}

function lotus(r) {
  const p = PAL.lotus;
  let s = fern('fern', r);
  [[34, 70], [58, 54], [70, 84], [44, 92], [52, 38]].forEach(([x, y], i) => {
    const c1 = p.flowers[i % 2], c2 = p.flowers[(i + 1) % 2];
    s += `<g><circle cx="${x - 4}" cy="${y}" r="5" fill="${c1}"/><circle cx="${x + 4}" cy="${y}" r="5" fill="${c1}"/><circle cx="${x}" cy="${y - 4}" r="5" fill="${c2}"/><circle cx="${x}" cy="${y}" r="3" fill="#FFE27A"/></g>`;
  });
  return s;
}

function sprout() {
  return `<path d="M50 136 Q49 118 50 100" stroke="#5BAA45" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
         `<ellipse cx="40" cy="104" rx="11" ry="6" transform="rotate(-28 40 104)" fill="#7DC04A"/><ellipse cx="60" cy="98" rx="11" ry="6" transform="rotate(28 60 98)" fill="#5FA83A"/>`;
}

function treeSvg(kind, seed) {
  const r = rng(seed);
  let body;
  switch (kind) {
    case 'conifer': body = conifer(r); break;
    case 'palm':    body = palm(r); break;
    case 'bamboo':  body = bamboo(r); break;
    case 'cactus':  body = cactus(r); break;
    case 'fern':    body = fern(kind, r); break;
    case 'lotus':   body = lotus(r); break;
    case 'sprout':  body = sprout(); break;
    default:        body = broadleaf(kind, r);
  }
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" class="t-${kind}">${body}</svg>`;
}

window.TreeArt = { TREE_MAP, DEFAULT_TREE, getTreeForSubject, treeSvg, rng, hashStr, f1 };
})();
