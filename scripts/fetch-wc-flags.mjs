/**
 * Baixa bandeiras PNG (flagcdn) para public/flags/.
 * Uso: node scripts/fetch-wc-flags.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flagsDir = path.join(root, 'public', 'flags');

/** ISO local → URL flagcdn */
const FLAG_SOURCES = {
  za: 'za',
  sa: 'sa',
  dz: 'dz',
  au: 'au',
  at: 'at',
  ba: 'ba',
  qa: 'qa',
  cw: 'cw',
  eg: 'eg',
  sc: 'gb-sct',
  eng: 'gb-eng',
  ht: 'ht',
  iq: 'iq',
  jo: 'jo',
  ma: 'ma',
  nz: 'nz',
  no: 'no',
  pa: 'pa',
  cd: 'cd',
  ir: 'ir',
  se: 'se',
  ch: 'ch',
  cz: 'cz',
  tn: 'tn',
  tr: 'tr',
  uz: 'uz',
};

mkdirSync(flagsDir, { recursive: true });

let ok = 0;
let skip = 0;

for (const [local, remote] of Object.entries(FLAG_SOURCES)) {
  const dest = path.join(flagsDir, `${local}.png`);
  if (existsSync(dest)) {
    skip += 1;
    continue;
  }
  const url = `https://flagcdn.com/w80/${remote}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`FAIL ${local} (${url}) → ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  ok += 1;
  console.log(`OK ${local}.png`);
}

console.log(`Done: ${ok} downloaded, ${skip} skipped (already exist).`);
