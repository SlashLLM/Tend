// Usage: node scripts/i18n-merge.mjs <triples.json>
// triples.json: nested object whose leaves are [en, zh, ms]; merged into messages/{en,zh,ms}.json.
import fs from 'node:fs';

const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const locales = ['en', 'zh', 'ms'];
for (const [i, loc] of locales.entries()) {
  const file = new URL(`../messages/${loc}.json`, import.meta.url);
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const cat = JSON.parse(raw);
  const walk = (node, target, path) => {
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v)) {
        if (v.length !== 3) throw new Error(`bad triple at ${path}${k}`);
        target[k] = v[i];
      } else {
        if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
        walk(v, target[k], `${path}${k}.`);
      }
    }
  };
  walk(src, cat, '');
  fs.writeFileSync(file, (JSON.stringify(cat, null, 2) + '\n').replace(/\n/g, eol));
}
console.log('merged', process.argv[2]);
