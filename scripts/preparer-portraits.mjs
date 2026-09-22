/**
 * Prépare les portraits des professeurs : conversion WebP multi-tailles.
 *
 * Pourquoi Chrome plutôt que `sharp` : le projet n'a aucune dépendance de
 * traitement d'image, et en ajouter une de 30 Mo pour convertir quatre
 * fichiers une seule fois serait disproportionné. L'encodeur WebP de Chrome
 * est celui de référence, et il est déjà installé puisque Puppeteer pilote
 * un vrai navigateur pour les tests.
 *
 * Les calques d'animation ne tirent aucune couleur d'ici : la paupière est
 * un fragment de l'image elle-même, prélevé juste au-dessus de l'œil, donc
 * sa teinte est exacte par construction. Ce script ne fait que convertir.
 *
 * Usage : node scripts/preparer-portraits.mjs [url-racine]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:8100';
const SORTIE = 'public/profs';
/** Le portrait s'affiche autour de 260 px de large ; 2x et 3x couvrent les
 *  écrans denses, 1024 reste disponible pour une éventuelle vue agrandie. */
const TAILLES = [192, 320, 512, 768, 1024];
/** 0,92 : au-dessus, le gain de poids disparaît ; en dessous, le dégradé du
 *  fond montre des bandes sur ces illustrations très lisses. */
const QUALITE = 0.92;

mkdirSync(SORTIE, { recursive: true });

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${BASE}/PROFS/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

/** Les quatre portraits attendus dans `PROFS/`. */
const PORTRAITS = ['homme-ultime', 'ephraim', 'johana', 'serena'];

for (const id of PORTRAITS) {
  const r = await page.evaluate(
    async (base, id, tailles, qualite) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `${base}/PROFS/${id}.jpg`;
      await img.decode();

      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const fichiers = [];
      for (const t of tailles) {
        const c2 = document.createElement('canvas');
        c2.width = t;
        c2.height = Math.round((t * img.naturalHeight) / img.naturalWidth);
        const x2 = c2.getContext('2d');
        x2.imageSmoothingEnabled = true;
        x2.imageSmoothingQuality = 'high';
        x2.drawImage(img, 0, 0, c2.width, c2.height);
        const url = c2.toDataURL('image/webp', qualite);
        fichiers.push({ taille: t, donnees: url.split(',')[1] });
      }

      return { largeur: img.naturalWidth, hauteur: img.naturalHeight, fichiers };
    },
    BASE,
    id,
    TAILLES,
    QUALITE,
  );

  const poids = [];
  for (const f of r.fichiers) {
    const buf = Buffer.from(f.donnees, 'base64');
    writeFileSync(`${SORTIE}/${id}-${f.taille}.webp`, buf);
    poids.push(`${f.taille}px ${(buf.length / 1024).toFixed(0)} Ko`);
  }
  console.log(`${id.padEnd(14)} ${r.largeur}x${r.hauteur}  ${poids.join('  ')}`);
}

await nav.close();
console.log(`
Portraits convertis dans ${SORTIE}/`);
