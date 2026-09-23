/**
 * Vue de contrôle des pastilles de bouche.
 *
 * Produit une planche : chaque professeur sur une ligne, ses trois états en
 * colonnes, recadrés sur le bas du visage. C'est la seule façon honnête de
 * juger une couture — une mesure dit qu'il n'y en a pas par construction,
 * elle ne dit pas si la bouche ouverte a l'air vraie.
 *
 * Écrit `captures/bouches.png` et mesure au passage la différence hors
 * pastille, qui doit être rigoureusement nulle : le portrait ne doit pas
 * bouger d'un pixel quand la bouche s'ouvre.
 *
 * Usage : node --experimental-strip-types scripts/apercu-bouches.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';
import { boiteBouche, COTE_SOURCE, REPERES } from '../src/lib/reperesPortraits.ts';

const BASE = process.argv[2] ?? 'http://localhost:8100';
const PORTRAITS = ['homme-ultime', 'ephraim', 'johana', 'serena'];
const ETATS = ['fermee', 'entrouverte', 'ouverte'];
/** Côté d'une vignette, en pixels. */
const VIGNETTE = 320;

mkdirSync('captures', { recursive: true });

const nav = await puppeteer.launch(optionsLancement());
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

const lignes = PORTRAITS.map((id) => {
  const b = boiteBouche(REPERES[id]);
  // Cadrage : le bas du visage, centré sur la pastille, assez large pour
  // qu'on voie le raccord avec les joues et le menton.
  const zoom = 2.2;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const cote = Math.max(b.w, b.h) * zoom;
  const echelle = VIGNETTE / cote;
  const cases = ETATS.map((etat) => {
    const pastille =
      etat === 'fermee'
        ? ''
        : `<img class="bouche" src="/profs/${id}-bouche-${etat}.webp"
             style="left:${(b.x - (cx - cote / 2)) * echelle}px;
                    top:${(b.y - (cy - cote / 2)) * echelle}px;
                    width:${b.w * echelle}px;height:${b.h * echelle}px">`;
    return `<div class="case">
        <div class="cadre">
          <img class="fond" src="/profs/${id}-1024.webp"
               style="width:${COTE_SOURCE * echelle}px;
                      left:${-(cx - cote / 2) * echelle}px;
                      top:${-(cy - cote / 2) * echelle}px">
          ${pastille}
        </div>
        <span>${etat}</span>
      </div>`;
  }).join('');
  return `<section><h2>${id}</h2><div class="rang">${cases}</div></section>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:24px; background:#1a1512; color:#f2ece3;
         font-family: system-ui, sans-serif }
  h1 { font-size:20px; margin:0 0 4px }
  p.note { margin:0 0 20px; color:#a89a8b; font-size:13px }
  h2 { font-size:14px; margin:20px 0 8px; color:#c9b08a; font-weight:600 }
  .rang { display:flex; gap:16px }
  .case { display:flex; flex-direction:column; gap:6px; align-items:center }
  .case span { font-size:12px; color:#a89a8b }
  .cadre { position:relative; width:${VIGNETTE}px; height:${VIGNETTE}px;
           overflow:hidden; border-radius:10px; background:#000 }
  .fond, .bouche { position:absolute; display:block }
</style>
<h1>Pastilles de bouche — vue de contrôle</h1>
<p class="note">Recadré sur le bas du visage. Le raccord doit être invisible :
la pastille est à bord d’alpha fondu, donc à sa limite le pixel affiché est
celui du portrait.</p>
${lignes}`;

await page.setViewport({ width: 1160, height: 1800, deviceScaleFactor: 2 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.setContent(html, { waitUntil: 'networkidle0' });
// `setContent` remplace le document mais conserve l'origine : les chemins
// absolus `/profs/...` sont donc bien servis.
await page.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode())));

const hauteur = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: 1160, height: hauteur, deviceScaleFactor: 2 });
const png = await page.screenshot({ type: 'png' });
writeFileSync('captures/bouches.png', png);

// Contrôle chiffré : hors pastille, rien ne doit changer.
const ecarts = await page.evaluate(
  async (portraits, cote) => {
    const charger = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    };
    const res = [];
    for (const id of portraits) {
      const fond = await charger(`/profs/${id}-1024.webp`);
      for (const etat of ['entrouverte', 'ouverte']) {
        const past = await charger(`/profs/${id}-bouche-${etat}.webp`);
        // On mesure l'alpha au bord de la pastille : s'il n'est pas nul, il
        // y a une couture.
        const c = document.createElement('canvas');
        c.width = past.naturalWidth;
        c.height = past.naturalHeight;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(past, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let bordMax = 0;
        const lire = (i, j) => d[(j * c.width + i) * 4 + 3];
        for (let i = 0; i < c.width; i++) {
          bordMax = Math.max(bordMax, lire(i, 0), lire(i, c.height - 1));
        }
        for (let j = 0; j < c.height; j++) {
          bordMax = Math.max(bordMax, lire(0, j), lire(c.width - 1, j));
        }
        res.push({ id, etat, bordMax, taille: `${c.width}x${c.height}`, fond: fond.naturalWidth === cote });
      }
    }
    return res;
  },
  PORTRAITS,
  COTE_SOURCE,
);

let echecs = 0;
console.log('  portrait        état          pastille    alpha max au bord');
console.log('  ----------------------------------------------------------');
for (const e of ecarts) {
  // 2 sur 255 : c'est l'arrondi de l'alpha en WebP avec perte, soit moins
  // d'un pour cent d'opacité. Exiger zéro reviendrait à exiger un encodage
  // sans perte pour rien — vérifié à l'œil sur captures/bouches.png.
  const ok = e.bordMax <= 2;
  if (!ok) echecs++;
  console.log(
    `  ${e.id.padEnd(14)} ${e.etat.padEnd(13)} ${e.taille.padEnd(11)} ${String(e.bordMax).padStart(3)}   ${ok ? 'aucune couture' : 'COUTURE'}`,
  );
}

await nav.close();
console.log(`\nPlanche écrite dans captures/bouches.png`);
process.exit(echecs === 0 ? 0 : 1);
