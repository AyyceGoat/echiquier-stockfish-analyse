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
import { boiteBouche, COTE_SOURCE, REPERES } from '../src/lib/reperesPortraits.ts';

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


/* --- Pastilles de bouche --------------------------------------------------
 *
 * Les rendus « entrouverte » et « ouverte » sont des images distinctes, pas
 * des retouches du portrait d'origine : mesuré par `controler-bouches.mjs`,
 * le visage entier diffère de 2 à 4 niveaux sur 255, et échanger l'image
 * complète ferait vibrer les yeux et les cheveux à chaque syllabe.
 *
 * On ne garde donc que la région de la bouche, découpée en ellipse à bord
 * fondu et posée sur le portrait immobile. L'écart résiduel du pourtour
 * disparaît dans le fondu de l'alpha : à la limite de la pastille, le pixel
 * affiché est exactement celui du portrait d'origine.
 *
 * C'est aussi ce qui distingue cette version de la précédente tentative :
 * la bouche ouverte n'est plus simulée par un assombrissement, elle vient
 * d'un vrai rendu.
 */
const ETATS_BOUCHE = ['entrouverte', 'ouverte'];
/** Part du rayon restant pleinement opaque avant le fondu. */
const NOYAU = 0.62;

for (const id of PORTRAITS) {
  const reperes = REPERES[id];
  for (const etat of ETATS_BOUCHE) {
    const r = await page.evaluate(
      async (base, id, etat, reperes, cote, qualite, boite, noyau) => {
        const charger = async (src) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = src;
          await img.decode();
          return img;
        };
        const variante = await charger(`${base}/PROFS/${id}-${etat}.jpg`);

        // Les rendus n'ont pas tous la même définition : on ramène tout au
        // carré de référence dans lequel les repères sont exprimés.
        const plein = document.createElement('canvas');
        plein.width = cote;
        plein.height = cote;
        const xp = plein.getContext('2d');
        xp.imageSmoothingQuality = 'high';
        xp.drawImage(variante, 0, 0, cote, cote);

        const { x: x0, y: y0, w: L, h: H } = boite;
        const rx = L / 2;
        const ry = H / 2;

        const c = document.createElement('canvas');
        c.width = L;
        c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(plein, x0, y0, L, H, 0, 0, L, H);

        // Fondu elliptique de l'alpha : plein au centre, nul au bord.
        const px = x.getImageData(0, 0, L, H);
        for (let j = 0; j < H; j++) {
          for (let i = 0; i < L; i++) {
            const dx = (i - rx) / rx;
            const dy = (j - ry) / ry;
            const d = Math.sqrt(dx * dx + dy * dy);
            let a = 1;
            if (d >= 1) a = 0;
            else if (d > noyau) {
              const t = (d - noyau) / (1 - noyau);
              // Lissage en cosinus : une rampe linéaire laisse un liseré
              // perceptible sur ces dégradés de peau très doux.
              a = 0.5 + 0.5 * Math.cos(Math.PI * t);
            }
            px.data[(j * L + i) * 4 + 3] = Math.round(255 * a);
          }
        }
        x.putImageData(px, 0, 0);

        return {
          donnees: c.toDataURL('image/webp', qualite).split(',')[1],
          boite: { x: x0, y: y0, l: L, h: H },
        };
      },
      BASE,
      id,
      etat,
      reperes,
      COTE_SOURCE,
      QUALITE,
      boiteBouche(reperes),
      NOYAU,
    );

    const buf = Buffer.from(r.donnees, 'base64');
    writeFileSync(`${SORTIE}/${id}-bouche-${etat}.webp`, buf);
    console.log(
      `${(id + ' ' + etat).padEnd(28)} ${r.boite.l}x${r.boite.h} à (${r.boite.x},${r.boite.y})  ` +
        `${(buf.length / 1024).toFixed(0)} Ko`,
    );
  }
}

await nav.close();
console.log(`
Portraits convertis dans ${SORTIE}/`);
